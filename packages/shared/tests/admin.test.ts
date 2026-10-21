import { describe, expect, it } from "vitest";
import {
    aliasSetSchema,
    brokerErrorCodes,
    errorCodes,
    keyCreateSchema,
    keyUpdateSchema,
    maxVariantDescriptionLength,
    maxVariantTitleLength,
    roleSetSchema,
    variantUpdateSchema,
} from "../src";

describe("error codes", () => {
    it("include the management codes", () => {
        for (const code of ["FORBIDDEN", "NOT_FOUND", "CONFLICT"]) {
            expect(brokerErrorCodes).toContain(code);
            expect(errorCodes).toContain(code);
        }
    });
});

describe("variant text limits", () => {
    it("match the contract", () => {
        expect(maxVariantTitleLength).toBe(100);
        expect(maxVariantDescriptionLength).toBe(4000);
    });
});

describe("variantUpdateSchema", () => {
    it("rejects an empty object, naming the allowed fields", () => {
        const result = variantUpdateSchema.safeParse({});

        expect(result.success).toBe(false);
        expect(result.error?.issues[0]?.message).toBe(
            "Pass at least one of title, description, public, or pinned",
        );
    });

    it("accepts pinned on its own", () => {
        expect(variantUpdateSchema.parse({ pinned: true })).toEqual({
            pinned: true,
        });
    });

    it("rejects unknown fields", () => {
        expect(
            variantUpdateSchema.safeParse({ title: "a", name: "b" }).success,
        ).toBe(false);
    });

    it("accepts a multi-line description, null clearing, and public", () => {
        expect(variantUpdateSchema.parse({ description: "a\nb" })).toEqual({
            description: "a\nb",
        });
        expect(
            variantUpdateSchema.parse({
                title: null,
                description: null,
                public: true,
            }),
        ).toEqual({ title: null, description: null, public: true });
    });

    it("rejects wrongly typed fields", () => {
        expect(variantUpdateSchema.safeParse({ title: 1 }).success).toBe(false);
        expect(variantUpdateSchema.safeParse({ public: null }).success).toBe(
            false,
        );
    });
});

describe("aliasSetSchema", () => {
    it("requires a variant string and nothing else", () => {
        expect(aliasSetSchema.parse({ variant: "live" })).toEqual({
            variant: "live",
        });
        expect(aliasSetSchema.safeParse({}).success).toBe(false);
        expect(
            aliasSetSchema.safeParse({ variant: "live", extra: 1 }).success,
        ).toBe(false);
    });
});

describe("roleSetSchema", () => {
    it("accepts admin, manager, and null only", () => {
        for (const role of ["admin", "manager", null]) {
            expect(roleSetSchema.parse({ role })).toEqual({ role });
        }

        expect(roleSetSchema.safeParse({ role: "owner" }).success).toBe(false);
        expect(roleSetSchema.safeParse({}).success).toBe(false);
    });
});

describe("keyCreateSchema", () => {
    it("fills the defaults", () => {
        expect(
            keyCreateSchema.parse({ name: "k", rateLimitPerMinute: null }),
        ).toEqual({
            name: "k",
            rateLimitPerMinute: null,
            allVariants: false,
            canActForUsers: false,
            grants: [],
        });
    });

    it("keeps given values", () => {
        expect(
            keyCreateSchema.parse({
                name: "k",
                rateLimitPerMinute: 60,
                allVariants: true,
                canActForUsers: true,
                grants: ["live"],
            }),
        ).toEqual({
            name: "k",
            rateLimitPerMinute: 60,
            allVariants: true,
            canActForUsers: true,
            grants: ["live"],
        });
    });

    it("rejects a non-positive or fractional rate limit and unknown fields", () => {
        for (const rateLimitPerMinute of [0, -1, 1.5]) {
            expect(
                keyCreateSchema.safeParse({ name: "k", rateLimitPerMinute })
                    .success,
            ).toBe(false);
        }

        expect(
            keyCreateSchema.safeParse({
                name: "k",
                rateLimitPerMinute: null,
                extra: true,
            }).success,
        ).toBe(false);
    });
});

describe("keyUpdateSchema", () => {
    it("rejects an empty object, naming the allowed fields", () => {
        const result = keyUpdateSchema.safeParse({});

        expect(result.success).toBe(false);
        expect(result.error?.issues[0]?.message).toBe(
            "Pass at least one of rateLimitPerMinute, allVariants, or canActForUsers",
        );
    });

    it("accepts any single field, including a null rate limit", () => {
        expect(keyUpdateSchema.parse({ rateLimitPerMinute: null })).toEqual({
            rateLimitPerMinute: null,
        });
        expect(keyUpdateSchema.parse({ allVariants: true })).toEqual({
            allVariants: true,
        });
        expect(keyUpdateSchema.parse({ canActForUsers: false })).toEqual({
            canActForUsers: false,
        });
    });

    it("rejects a zero rate limit and unknown fields", () => {
        expect(
            keyUpdateSchema.safeParse({ rateLimitPerMinute: 0 }).success,
        ).toBe(false);
        expect(
            keyUpdateSchema.safeParse({ allVariants: true, name: "x" }).success,
        ).toBe(false);
    });
});
