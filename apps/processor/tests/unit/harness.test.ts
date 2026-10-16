import { ModDoubleTime, ModHidden } from "@rian8337/osu-base";
import {
    beatmapFixtureNames,
    md5Of,
    readBeatmapFixture,
} from "@test/utils/fixtures";
import { modMap } from "@test/utils/mods";
import { describe, expect, it } from "vitest";

describe("test harness", () => {
    it("loads reflect-metadata", () => {
        expect(typeof Reflect.getMetadata).toBe("function");
    });

    it.each(beatmapFixtureNames)("reads the %s fixture", (name) => {
        const content = readBeatmapFixture(name);

        expect(content.startsWith("osu file format")).toBe(true);
        expect(md5Of(content)).toMatch(/^[0-9a-f]{32}$/);
    });

    it("builds mod maps", () => {
        expect(
            modMap(new ModHidden(), new ModDoubleTime()).serializeMods(),
        ).toEqual([{ acronym: "HD" }, { acronym: "DT" }]);
    });
});
