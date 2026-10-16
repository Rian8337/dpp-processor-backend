import { generateApiKey, hashApiKey } from "@/registry/keys";
import { describe, expect, it } from "vitest";

describe("API keys", () => {
    it("generates distinct 32-byte base64url keys", () => {
        const key = generateApiKey();

        expect(key).toMatch(/^[A-Za-z0-9_-]{43}$/);
        expect(generateApiKey()).not.toBe(key);
    });

    it("hashes keys with SHA-256", () => {
        expect(hashApiKey("abc")).toBe(
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
        );
    });
});
