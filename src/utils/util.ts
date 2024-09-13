import { createHash } from "crypto";
import { Request, Response, NextFunction } from "express";
import { url } from "inspector";

/**
 * Whether the program is running in debug mode.
 */
export const isDebug = !!url();

/**
 * Computes the MD5 hash of a buffer.
 *
 * @param buf The buffer.
 * @returns The MD5 hash of the buffer.
 */
export function computeMD5(buf: Buffer): string {
    return createHash("md5").update(buf).digest("hex");
}

/**
 * Sorts a string alphabetically.
 *
 * @param str The string.
 * @returns The sorted string.
 */
export function sortAlphabet(str: string): string {
    return [...str].sort((a, b) => a.localeCompare(b)).join("");
}

/**
 * Validates whether a given internal key is valid in a GET request.
 */
export function validateGETInternalKey(
    req: Request<unknown, unknown, unknown, { key?: string }>,
    res: Response,
    next: NextFunction,
): void {
    if (req.query.key !== process.env.DROID_SERVER_INTERNAL_KEY) {
        res.status(401).json({
            message: "Please enter the correct API key.",
        });

        return;
    }

    next();
}

/**
 * Validates whether a given internal key is valid in a POST request.
 */
export function validatePOSTInternalKey(
    req: Request<unknown, unknown, Partial<{ key: string }>>,
    res: Response,
    next: NextFunction,
): void {
    if (req.body.key !== process.env.DROID_SERVER_INTERNAL_KEY) {
        res.status(401).json({
            message: "Please enter the correct API key.",
        });

        return;
    }

    next();
}
