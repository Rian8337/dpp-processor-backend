import { createModsKey } from "@/utils/modsKey";
import { ModDoubleTime, ModHardRock, ModHidden } from "@rian8337/osu-base";
import { modMap } from "@test/utils/mods";
import { describe, expect, it } from "vitest";

describe("createModsKey", () => {
    it("is independent of mod order", () => {
        expect(
            createModsKey(
                modMap(new ModHidden(), new ModDoubleTime()).serializeMods(),
            ),
        ).toBe(
            createModsKey(
                modMap(new ModDoubleTime(), new ModHidden()).serializeMods(),
            ),
        );
    });

    it("produces a stable JSON string sorted by acronym", () => {
        expect(
            createModsKey(
                modMap(new ModHardRock(), new ModDoubleTime()).serializeMods(),
            ),
        ).toBe('[{"acronym":"DT"},{"acronym":"HR"}]');
        expect(createModsKey([])).toBe("[]");
    });

    // The cases below are about the shape of serialized settings, so they use serialized mods directly.

    it("is independent of settings key order, including nested objects", () => {
        expect(
            createModsKey([
                {
                    acronym: "DA",
                    settings: { cs: 4, ar: 9, extra: { b: 1, a: 2 } },
                },
            ]),
        ).toBe(
            createModsKey([
                {
                    acronym: "DA",
                    settings: { extra: { a: 2, b: 1 }, ar: 9, cs: 4 },
                },
            ]),
        );
    });

    it("treats empty settings like no settings", () => {
        expect(createModsKey([{ acronym: "HD", settings: {} }])).toBe(
            createModsKey([{ acronym: "HD" }]),
        );
    });

    it("distinguishes different settings", () => {
        expect(
            createModsKey([{ acronym: "DA", settings: { ar: 8 } }]),
        ).not.toBe(createModsKey([{ acronym: "DA", settings: { ar: 9 } }]));
    });
});
