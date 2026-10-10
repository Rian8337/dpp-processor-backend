import { danCourseSchema, userBindSchema } from "@/mongo/documents";
import { describe, expect, it } from "vitest";

describe("danCourseSchema", () => {
    it("accepts a course and keeps its other fields", () => {
        const course = {
            courseName: "Dan 1",
            hash: "0123456789abcdef0123456789abcdef",
            requirement: { id: "acc", value: 95 },
            fileName: "dan1.osu",
            roleId: "1",
        };

        expect(danCourseSchema.parse(course)).toEqual(course);
    });

    it.each([
        [{ hash: 1, requirement: { id: "acc", value: 1 } }],
        [{ hash: "a", requirement: { value: 1 } }],
        [{ hash: "a" }],
    ])("rejects %j", (document) => {
        expect(danCourseSchema.safeParse(document).success).toBe(false);
    });
});

describe("userBindSchema", () => {
    it("reads the Discord ID", () => {
        expect(userBindSchema.parse({ discordid: "123" })).toEqual({
            discordid: "123",
        });
    });

    it("rejects an empty or missing ID", () => {
        expect(userBindSchema.safeParse({ discordid: "" }).success).toBe(false);
        expect(userBindSchema.safeParse({}).success).toBe(false);
    });
});
