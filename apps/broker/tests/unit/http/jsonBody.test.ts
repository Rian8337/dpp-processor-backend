import { readJsonBody } from "@/http/jsonBody";
import { BadRequestError } from "@dpp/server";
import type { Request } from "express";
import { describe, expect, it } from "vitest";

function requestWith(body: unknown): Request {
    return { body } as Request;
}

describe("readJsonBody", () => {
    it("parses a buffered JSON body", () => {
        expect(
            readJsonBody(requestWith(Buffer.from('{"title":"x","n":[1]}'))),
        ).toEqual({ title: "x", n: [1] });
    });

    it.each([
        ["an empty buffer", Buffer.alloc(0)],
        ["invalid JSON", Buffer.from("{nope")],
        ["a body that express.raw left unparsed", {}],
        ["a missing body", undefined],
        ["a string", "{}"],
    ])("rejects %s", (_name, body) => {
        expect(() => readJsonBody(requestWith(body))).toThrow(
            new BadRequestError(
                "Request body must be JSON, sent with Content-Type: application/json",
            ),
        );
    });
});
