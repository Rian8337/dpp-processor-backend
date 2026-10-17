import { BadRequestError } from "@dpp/server";
import type { Request } from "express";

/**
 * Parses the body that `express.raw` buffered. Callers validate the result with a schema.
 *
 * @throws {BadRequestError} If the body is missing, empty, or not JSON.
 */
export function readJsonBody(req: Request): unknown {
    const body: unknown = req.body;

    if (Buffer.isBuffer(body) && body.length > 0) {
        try {
            return JSON.parse(body.toString("utf8"));
        } catch {
            // Reported below.
        }
    }

    throw new BadRequestError(
        "Request body must be JSON, sent with Content-Type: application/json",
    );
}
