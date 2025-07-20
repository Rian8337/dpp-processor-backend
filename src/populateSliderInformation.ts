import { BeatmapDecoder, Modes } from "@rian8337/osu-base";
import { ReplayAnalyzer } from "@rian8337/osu-droid-replay-analyzer";
import "dotenv/config";
import { eq } from "drizzle-orm";
import { officialDb } from "./database/official";
import { bestScoresTable, scoresTable } from "./database/official/schema";
import { processorDb } from "./database/processor";
import { scoreCalculationTable } from "./database/processor/schema";
import { getBeatmapFile } from "./services/beatmapService";
import { isReplayValid, obtainTickInformation } from "./utils/dppUtil";
import { getOfficialBestReplay, getOnlineReplay } from "./utils/replayManager";

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
                console.error("Failed to fetch best score", e);

                return null;
            });

        if (!score || score.score === 0) {
            console.log("Score ID", scoreId, "does not exist");
            continue;
        }

        if (score.sliderTickHit !== null && score.sliderEndHit !== null) {
            console.log("Score ID", scoreId, "already has slider information");
            continue;
        }

        const beatmapFile = await getBeatmapFile(score.hash);

        if (!beatmapFile) {
            console.log("Score ID", scoreId, "has no beatmap");
            continue;
        }

        const beatmap = new BeatmapDecoder().decode(
            beatmapFile,
            Modes.droid,
        ).result;

        const replayFile = await getOnlineReplay(scoreId);

        if (replayFile) {
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

        const bestScore = await officialDb
            .select()
            .from(bestScoresTable)
            .where(eq(bestScoresTable.id, scoreId))
            .then((res) => res.at(0) ?? null)
            .catch((e: unknown) => {
                console.error("Failed to fetch best score", e);

                return null;
            });

        if (bestScore) {
            const bestReplayFile = await getOfficialBestReplay(scoreId);

            if (bestReplayFile) {
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

    console.log("Process done");
})().catch((e: unknown) => {
    console.error("Failed to initialize database manager", e);
});
