import { parseReplay } from "@/replays/parseReplay";
import { readReplayFixture } from "@test/utils/fixtures";
import { describe, expect, it } from "vitest";

const v3 = readReplayFixture("v3");

describe("parseReplay", () => {
    it("returns null for bytes that are not a replay", async () => {
        expect(await parseReplay(Buffer.from("not a replay"))).toBeNull();
        expect(await parseReplay(Buffer.alloc(0))).toBeNull();
    });

    it.skipIf(!v3)("reads a v3 replay", async () => {
        const parsed = await parseReplay(v3!);

        expect(parsed?.v3).not.toBeNull();
        expect(parsed?.hash).toMatch(/^[0-9a-f]{32}$/);
        expect(parsed?.v3?.playerName.length).toBeGreaterThan(0);
    });

    it.skipIf(!v3)("returns null for a truncated replay", async () => {
        expect(
            await parseReplay(v3!.subarray(0, Math.floor(v3!.length / 2))),
        ).toBeNull();
    });
});
