import { createAlgorithm } from "@/algorithms/createAlgorithm";
import type { ICalculationRunner } from "@/calculation/ICalculationRunner";
import { InlineRunner } from "@/calculation/InlineRunner";
import type { VariantManifest } from "@/manifest/manifest";
import type { IDifficultyAttributesRepository } from "@/repositories/IDifficultyAttributesRepository";
import { DifficultyCacheService } from "@/services/DifficultyCacheService";
import type { ResolvedBeatmap } from "@/services/IBeatmapService";
import { ModDoubleTime, Modes, ModNoFail } from "@rian8337/osu-base";
import type {
    CacheableDifficultyAttributes,
    IDifficultyAttributes,
} from "@rian8337/osu-difficulty-calculator";
import { calculateFixtureDifficulty } from "@test/utils/attributes";
import { modMap } from "@test/utils/mods";
import { beforeEach, describe, expect, it, vi } from "vitest";

const algorithm = createAlgorithm(Modes.Droid);

const manifest: VariantManifest = {
    id: "test-droid",
    mode: Modes.Droid,
    algorithm: "live",
    calculatorVersion: "0123456789abcdef",
    source: "npm",
    builtAt: "2026-10-05T00:00:00.000Z",
};

const attributes = calculateFixtureDifficulty(
    "discoprince",
    Modes.Droid,
    modMap(new ModDoubleTime()),
);

describe("DifficultyCacheService", () => {
    let find: ReturnType<typeof vi.fn<IDifficultyAttributesRepository["find"]>>;
    let insert: ReturnType<
        typeof vi.fn<IDifficultyAttributesRepository["insert"]>
    >;
    let calculateDifficulty: ReturnType<
        typeof vi.fn<ICalculationRunner["calculateDifficulty"]>
    >;
    let getFile: ReturnType<typeof vi.fn<ResolvedBeatmap["getFile"]>>;
    let service: DifficultyCacheService;

    // NoFail is not difficulty-adjusting, so it must not be part of the key or the calculation.
    const mods = modMap(new ModNoFail(), new ModDoubleTime());
    const difficultyMods = modMap(new ModDoubleTime()).serializeMods();

    const beatmap = (cacheable = true): ResolvedBeatmap => ({
        hash: "a".repeat(32),
        cacheable,
        getFile,
    });

    beforeEach(() => {
        find = vi.fn<IDifficultyAttributesRepository["find"]>(() =>
            Promise.resolve(null),
        );
        insert = vi.fn<IDifficultyAttributesRepository["insert"]>(() =>
            Promise.resolve(),
        );
        getFile = vi.fn<ResolvedBeatmap["getFile"]>(() =>
            Promise.resolve("osu file"),
        );

        const runner = new InlineRunner(algorithm);
        calculateDifficulty = vi.fn<ICalculationRunner["calculateDifficulty"]>(
            () => Promise.resolve(attributes),
        );
        runner.calculateDifficulty = calculateDifficulty;

        service = new DifficultyCacheService(
            algorithm,
            manifest,
            { find, insert, deleteOtherVersions: () => Promise.resolve(0) },
            runner,
        );
    });

    it("calculates on a miss with difficulty-adjusting mods only, then stores the result", async () => {
        expect(await service.get(beatmap(), mods)).toBe(attributes);

        const key = {
            calculatorVersion: "0123456789abcdef",
            beatmapHash: "a".repeat(32),
            mods: '[{"acronym":"DT"}]',
        };

        expect(find).toHaveBeenCalledWith(key);
        expect(calculateDifficulty).toHaveBeenCalledWith({
            beatmapHash: "a".repeat(32),
            osuFile: "osu file",
            mods: difficultyMods,
        });
        expect(insert).toHaveBeenCalledWith(key, attributes);
    });

    it("serves stored attributes without fetching the file or calculating", async () => {
        find.mockResolvedValueOnce(attributes);

        expect(await service.get(beatmap(), mods)).toBe(attributes);
        expect(getFile).not.toHaveBeenCalled();
        expect(calculateDifficulty).not.toHaveBeenCalled();
    });

    it("serves repeated requests from memory", async () => {
        await service.get(beatmap(), mods);
        await service.get(beatmap(), modMap(new ModDoubleTime()));

        expect(find).toHaveBeenCalledTimes(1);
        expect(calculateDifficulty).toHaveBeenCalledTimes(1);
    });

    it("shares one calculation between concurrent misses", async () => {
        let finish: (
            value: CacheableDifficultyAttributes<IDifficultyAttributes>,
        ) => void = () => undefined;
        calculateDifficulty.mockReturnValueOnce(
            new Promise((resolve) => (finish = resolve)),
        );

        const pending = [
            service.get(beatmap(), mods),
            service.get(beatmap(), mods),
        ];
        await vi.waitFor(() => expect(calculateDifficulty).toHaveBeenCalled());
        finish(attributes);

        expect(await Promise.all(pending)).toEqual([attributes, attributes]);
        expect(calculateDifficulty).toHaveBeenCalledTimes(1);
    });

    it("retries after a failed calculation instead of caching the failure", async () => {
        calculateDifficulty.mockRejectedValueOnce(new Error("boom"));

        await expect(service.get(beatmap(), mods)).rejects.toThrow("boom");
        expect(await service.get(beatmap(), mods)).toBe(attributes);
    });

    it("treats database read and write failures as non-fatal", async () => {
        vi.spyOn(console, "error").mockImplementation(() => undefined);
        find.mockRejectedValueOnce(new Error("db down"));
        insert.mockRejectedValueOnce(new Error("db down"));

        expect(await service.get(beatmap(), mods)).toBe(attributes);
    });

    it("never reads or stores uploaded beatmaps", async () => {
        expect(await service.get(beatmap(false), mods)).toBe(attributes);
        expect(await service.get(beatmap(false), mods)).toBe(attributes);

        expect(find).not.toHaveBeenCalled();
        expect(insert).not.toHaveBeenCalled();
        expect(calculateDifficulty).toHaveBeenCalledTimes(2);
    });
});
