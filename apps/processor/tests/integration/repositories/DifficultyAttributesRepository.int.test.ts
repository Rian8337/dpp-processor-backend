import { DifficultyAttributesRepository } from "@/repositories/DifficultyAttributesRepository";
import { ModDoubleTime, Modes } from "@rian8337/osu-base";
import { calculateFixtureDifficulty } from "@test/utils/attributes";
import { createTestDatabase, type TestDatabase } from "@test/utils/database";
import { modMap } from "@test/utils/mods";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// PGlite-backed containers and the replay analyzer's fixed 2 s error delay take seconds; keep a wide margin.
vi.setConfig({ testTimeout: 15_000, hookTimeout: 15_000 });

const key = {
    calculatorVersion: "aaaaaaaaaaaaaaaa",
    beatmapHash: "0123456789abcdef0123456789abcdef",
    mods: '[{"acronym":"DT"}]',
};

// Real droid attributes include nested JSON (difficult sliders, three-finger sections).
const attributes = calculateFixtureDifficulty(
    "loveLetter",
    Modes.Droid,
    modMap(new ModDoubleTime()),
);

describe("DifficultyAttributesRepository (integration)", () => {
    let testDatabase: TestDatabase;
    let repository: DifficultyAttributesRepository;

    beforeEach(async () => {
        testDatabase = await createTestDatabase();
        repository = new DifficultyAttributesRepository(testDatabase.db);
    });

    afterEach(() => testDatabase[Symbol.asyncDispose]());

    it("returns null when nothing is stored", async () => {
        expect(await repository.find(key)).toBeNull();
    });

    it("round-trips attributes, including nested JSON", async () => {
        await repository.insert(key, attributes);

        expect(await repository.find(key)).toEqual(attributes);
    });

    it("matches on every key column", async () => {
        await repository.insert(key, attributes);

        expect(await repository.find({ ...key, mods: "[]" })).toBeNull();
        expect(
            await repository.find({
                ...key,
                calculatorVersion: "bbbbbbbbbbbbbbbb",
            }),
        ).toBeNull();
        expect(
            await repository.find({ ...key, beatmapHash: "f".repeat(32) }),
        ).toBeNull();
    });

    it("ignores a duplicate insert", async () => {
        await repository.insert(key, attributes);
        await repository.insert(key, { ...attributes, starRating: 1 });

        expect((await repository.find(key))?.starRating).toBe(
            attributes.starRating,
        );
    });

    it("deletes rows of other calculator versions only", async () => {
        await repository.insert(key, attributes);
        await repository.insert(
            { ...key, calculatorVersion: "bbbbbbbbbbbbbbbb" },
            attributes,
        );
        await repository.insert(
            { ...key, calculatorVersion: "cccccccccccccccc" },
            attributes,
        );

        expect(
            await repository.deleteOtherVersions(key.calculatorVersion),
        ).toBe(2);
        expect(await repository.find(key)).toEqual(attributes);
    });
});
