import { createHash } from "crypto";
import { Request, Response, NextFunction } from "express";

/**
 * Some utilities, no biggie.
 */
export abstract class Util {
    /**
     * Computes the MD5 hash of a buffer.
     *
     * @param buf The buffer.
     * @returns The MD5 hash of the buffer.
     */
    static computeMD5(buf: Buffer): string {
        return createHash("md5").update(buf).digest("hex");
    }

    /**
     * Sorts a string alphabetically.
     *
     * @param str The string.
     * @returns The sorted string.
     */
    static sortAlphabet(str: string): string {
        return [...str].sort((a, b) => a.localeCompare(b)).join("");
    }

    /**
     * Validates whether a given internal key is valid in a GET request.
     */
    static validateGETInternalKey(
        req: Request<unknown, unknown, unknown, { key: string }>,
        res: Response,
        next: NextFunction
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
    static validatePOSTInternalKey(
        req: Request<unknown, unknown, { key: string }>,
        res: Response,
        next: NextFunction
    ): void {
        if (req.body.key !== process.env.DROID_SERVER_INTERNAL_KEY) {
            res.status(401).json({
                message: "Please enter the correct API key.",
            });

            return;
        }

        next();
    }
}
