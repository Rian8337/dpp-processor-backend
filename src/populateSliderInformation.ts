import {
    Beatmap,
    BeatmapDecoder,
    Modes,
    ModReplayV6,
    ModUtil,
} from "@rian8337/osu-base";
import { ReplayAnalyzer } from "@rian8337/osu-droid-replay-analyzer";
import "dotenv/config";
import { eq, isNotNull } from "drizzle-orm";
import { officialDb } from "./database/official";
import {
    bestScoresTable,
    scoresTable,
    uncalculatedScoresTable,
} from "./database/official/schema";
import { processorDb } from "./database/processor";
import { scoreCalculationTable } from "./database/processor/schema";
import { getBeatmapFile } from "./services/beatmapService";
import { isReplayValid } from "./utils/dppUtil";
import {
    getOfficialBestReplay,
    getOnlineReplay,
    obtainTickInformation,
} from "./utils/replayManager";
import { readFile } from "fs/promises";

(async () => {
    const processId = 0;

    let id = await processorDb
        .select()
        .from(scoreCalculationTable)
        .where(eq(scoreCalculationTable.process_id, processId))
        .then((res) => res.at(0)?.score_id ?? null)
        .catch((e: unknown) => {
            console.error("Failed to fetch calculation progress", e);

            process.exit(1);
        });

    if (!id) {
        id = 207695;

        await processorDb.insert(scoreCalculationTable).values({
            process_id: processId,
            score_id: id,
        });
    }

    while (id <= 26000000) {
        let beatmapFile: string | null | undefined;
        let beatmap: Beatmap | null = null;

        const scoreId = id++;

        await processorDb
            .update(scoreCalculationTable)
            .set({ score_id: id })
            .where(eq(scoreCalculationTable.process_id, processId));

        const score = await officialDb
            .select()
            .from(scoresTable)
            .where(eq(scoresTable.id, scoreId))
            .then((res) => res.at(0) ?? null)
            .catch((e: unknown) => {
                console.error("Failed to fetch score", e);

                return null;
            });

        if (!score || score.score === 0) {
            console.log("Score ID", scoreId, "does not exist");
            continue;
        }

        if (!ModUtil.deserializeMods(score.mods).has(ModReplayV6)) {
            const replayFile = await getOnlineReplay(scoreId);

            if (replayFile) {
                beatmapFile ??= await getBeatmapFile(score.hash);

                if (!beatmapFile) {
                    console.log("Score ID", scoreId, "has no beatmap");
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
                        .where(eq(scoresTable.id, scoreId));
                }
            }
        }

        const bestScore = await officialDb
            .select()
            .from(bestScoresTable)
            .where(eq(bestScoresTable.id, scoreId))
            .then((res) => res.at(0) ?? null)
            .catch((e: unknown) => {
                console.error("Failed to fetch best score", e);

                return null;
            });

        if (
            bestScore &&
            !ModUtil.deserializeMods(bestScore.mods).has(ModReplayV6)
        ) {
            const bestReplayFile = await getOfficialBestReplay(scoreId);

            if (bestReplayFile) {
                beatmapFile ??= await getBeatmapFile(score.hash);

                if (!beatmapFile) {
                    console.log("Score ID", scoreId, "has no beatmap");
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
                        .where(eq(bestScoresTable.id, scoreId));
                }
            }
        }

        console.log("Processed score ID", scoreId);
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
