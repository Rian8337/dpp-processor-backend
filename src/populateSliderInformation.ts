import {
    Beatmap,
    BeatmapDecoder,
    Modes,
    ModReplayV6,
} from "@rian8337/osu-base";
import { ReplayAnalyzer } from "@rian8337/osu-droid-replay-analyzer";
import "dotenv/config";
import { and, eq, gt, isNotNull, notLike } from "drizzle-orm";
import { readFile } from "fs/promises";
import { officialDb } from "./database/official";
import {
    bestScoresTable,
    scoresTable,
    uncalculatedScoresTable,
} from "./database/official/schema";
import { getBeatmapFile } from "./services/beatmapService";
import { isReplayValid } from "./utils/dppUtil";
import {
    getOfficialBestReplay,
    getOnlineReplay,
    obtainTickInformation,
} from "./utils/replayManager";

(async () => {
    const scores = await officialDb
        .select()
        .from(scoresTable)
        .where(
            and(
                gt(scoresTable.score, 0),
                // Filter ModReplayV6 from mods since those scores are not bugged
                notLike(scoresTable.mods, `%${new ModReplayV6().acronym}%`),
            ),
        );

    for (const score of scores) {
        let beatmapFile: string | null | undefined;
        let beatmap: Beatmap | null = null;

        const replayFile = await getOnlineReplay(score.id);

        if (replayFile) {
            beatmapFile ??= await getBeatmapFile(score.hash);

            if (!beatmapFile) {
                console.log("Score ID", score.id, "has no beatmap");
                continue;
            }

            beatmap ??= new BeatmapDecoder().decode(
                beatmapFile,
                Modes.droid,
            ).result;

            const analyzer = new ReplayAnalyzer();

            analyzer.beatmap = beatmap;
            analyzer.originalODR = replayFile;

            await analyzer.analyze().catch(() => null);

            const { data } = analyzer;

            if (data !== null && isReplayValid(score, data)) {
                const { tick, end } = obtainTickInformation(beatmap, data);

                await officialDb
                    .update(scoresTable)
                    .set({
                        sliderTickHit: tick.obtained,
                        sliderEndHit: end.obtained,
                    })
                    .where(eq(scoresTable.id, score.id));
            }
        }

        const bestScore = await officialDb
            .select()
            .from(bestScoresTable)
            .where(eq(bestScoresTable.id, score.id))
            .then((res) => res.at(0) ?? null)
            .catch((e: unknown) => {
                console.error("Failed to fetch best score", e);

                return null;
            });

        if (bestScore) {
            const bestReplayFile = await getOfficialBestReplay(score.id);

            if (bestReplayFile) {
                beatmapFile ??= await getBeatmapFile(score.hash);

                if (!beatmapFile) {
                    console.log("Score ID", score.id, "has no beatmap");
                    continue;
                }

                beatmap ??= new BeatmapDecoder().decode(
                    beatmapFile,
                    Modes.droid,
                ).result;

                const analyzer = new ReplayAnalyzer();

                analyzer.beatmap = beatmap;
                analyzer.originalODR = bestReplayFile;

                await analyzer.analyze().catch(() => null);

                const { data } = analyzer;

                if (data !== null && isReplayValid(bestScore, data)) {
                    const { tick, end } = obtainTickInformation(beatmap, data);

                    await officialDb
                        .update(bestScoresTable)
                        .set({
                            sliderTickHit: tick.obtained,
                            sliderEndHit: end.obtained,
                        })
                        .where(eq(bestScoresTable.id, score.id));
                }
            }
        }

        console.log("Processed score ID", score.id);
    }

    const uncalculatedScores = await officialDb
        .select({
            replayfileName: uncalculatedScoresTable.replayfilename,
        })
        .from(uncalculatedScoresTable)
        .where(isNotNull(uncalculatedScoresTable.replayfilename));

    for (const uncalculatedScore of uncalculatedScores) {
        const replayFile = await readFile(
            `/hdd/osudroid/odr/uncalculated/${uncalculatedScore.replayfileName!}`,
        ).catch(() => null);

        if (!replayFile) {
            continue;
        }

        const analyzer = new ReplayAnalyzer();
        analyzer.originalODR = replayFile;

        await analyzer.analyze();

        const { data } = analyzer;

        if (!data) {
            continue;
        }

        const beatmapFile = await getBeatmapFile(data.hash);

        if (!beatmapFile) {
            continue;
        }

        const beatmap = new BeatmapDecoder().decode(
            beatmapFile,
            Modes.droid,
        ).result;

        const { tick, end } = obtainTickInformation(beatmap, data);

        await officialDb
            .update(uncalculatedScoresTable)
            .set({
                sliderTickHit: tick.obtained,
                sliderEndHit: end.obtained,
            })
            .where(
                eq(
                    uncalculatedScoresTable.replayfilename,
                    uncalculatedScore.replayfileName!,
                ),
            );

        console.log(
            "Processed uncalculated score with replay",
            uncalculatedScore.replayfileName,
        );
    }

    console.log("Process done");
})().catch((e: unknown) => {
    console.error("Failed to initialize database manager", e);
});
