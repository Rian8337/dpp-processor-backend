import { PiscinaRunner } from "@/calculation/PiscinaRunner";
import {
    CalculationFailedError,
    ServiceUnavailableError,
    UnprocessableEntityError,
} from "@/types/errors";
import { Modes } from "@rian8337/osu-base";
import { calculateFixtureDifficulty } from "@test/utils/attributes";
import { describe, expect, it } from "vitest";

const workerFile = new URL(
    "../../fixtures/workers/fake-worker.mjs",
    import.meta.url,
);
const chartInput = {
    beatmapHash: "h",
    osuFile: "f",
    mods: [],
    clockRate: 1,
    color: "#000000",
};

function createRunner(maxQueue = 10): PiscinaRunner {
    return new PiscinaRunner({
        mode: Modes.Droid,
        threads: 1,
        maxQueue,
        workerFile,
    });
}

describe("PiscinaRunner", () => {
    it("returns values from the worker, converting bytes to buffers", async () => {
        await using runner = createRunner();

        expect(await runner.renderStrainChart(chartInput)).toEqual(
            Buffer.from([1, 2, 3]),
        );
    });

    it("maps worker-reported invalid input to 422 errors", async () => {
        await using runner = createRunner();

        await expect(
            runner.analyzeReplay({
                beatmapHash: "h",
                osuFile: "f",
                replay: Buffer.from([1]),
                difficulty: calculateFixtureDifficulty(
                    "discoprince",
                    Modes.Droid,
                ),
            }),
        ).rejects.toBeInstanceOf(UnprocessableEntityError);
    });

    it("maps worker crashes to calculation failures", async () => {
        await using runner = createRunner();

        await expect(runner.readReplay(Buffer.alloc(0))).rejects.toBeInstanceOf(
            CalculationFailedError,
        );
    });

    it("rejects with OVERLOADED when the queue is full", async () => {
        await using runner = createRunner(1);

        const results = await Promise.allSettled([
            runner.renderStrainChart(chartInput),
            runner.renderStrainChart(chartInput),
            runner.renderStrainChart(chartInput),
        ]);

        const reasons = results.flatMap((result) =>
            result.status === "rejected" ? [result.reason] : [],
        );

        expect(reasons).toHaveLength(1);
        expect(reasons[0]).toBeInstanceOf(ServiceUnavailableError);
        expect(reasons[0]).toMatchObject({ code: "OVERLOADED" });
    });
});
