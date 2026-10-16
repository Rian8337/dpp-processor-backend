import { loopbackOnly } from "@/middleware/loopbackOnly";
import type { Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";

function run(remoteAddress: string | undefined) {
    const next = vi.fn();
    const json = vi.fn();
    const status = vi.fn(() => ({ json }));

    loopbackOnly(
        { socket: { remoteAddress } } as Request,
        { status } as unknown as Response,
        next,
    );

    return { next, status, json };
}

describe("loopbackOnly", () => {
    it.each(["127.0.0.1", "::1", "::ffff:127.0.0.1"])(
        "lets %s through",
        (address) => {
            const { next, status } = run(address);

            expect(next).toHaveBeenCalledOnce();
            expect(status).not.toHaveBeenCalled();
        },
    );

    it.each(["10.0.0.5", "::ffff:10.0.0.5", undefined])(
        "rejects %s",
        (address) => {
            const { next, status, json } = run(address);

            expect(next).not.toHaveBeenCalled();
            expect(status).toHaveBeenCalledWith(403);
            expect(json).toHaveBeenCalledWith({
                error: {
                    code: "UNAUTHORIZED",
                    message: "This route only accepts local connections",
                },
            });
        },
    );
});
