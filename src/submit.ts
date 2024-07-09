import { config } from "dotenv";
import { DatabaseManager } from "./database/managers/DatabaseManager";
import { processorPool } from "./database/processor/ProcessorDatabasePool";
import { readFile, readdir } from "fs/promises";
import { join } from "path";
import {
    deleteUnprocessedReplay,
    unprocessedReplayDirectory,
} from "./utils/replayManager";
import { ReplayAnalyzer } from "@rian8337/osu-droid-replay-analyzer";
import { submitReplayToDppDatabase } from "./utils/dppUtil";

config();

Promise.all([DatabaseManager.init(), processorPool.connect()])
    .then(async () => {
        const files = await readdir(unprocessedReplayDirectory);

        console.log("Initiating replay submission process");

        for (const file of files) {
            const replay = await readFile(
                join(unprocessedReplayDirectory, file),
            );

            const replayAnalyzer = new ReplayAnalyzer({ scoreID: 0 });
            replayAnalyzer.originalODR = replay;

            await replayAnalyzer.analyze().catch(() => {
                console.error(`Cannot process replay ${file}`);
            });

            const result = replayAnalyzer.data
                ? await submitReplayToDppDatabase(
                      [replayAnalyzer],
                      undefined,
                      true,
                  )
                : null;

            await deleteUnprocessedReplay(
                join(unprocessedReplayDirectory, file),
            );

            if (result?.statuses.at(0)?.success) {
                console.log(`Replay ${file} has been processed`);
            }
        }

        console.log("Replay submission process has been completed");
    })
    .catch((e: unknown) => {
        console.error(e);
        process.exit(1);
    });
