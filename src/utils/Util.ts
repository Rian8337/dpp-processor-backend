import { ReadStream } from "fs";
import { Request, Response, NextFunction } from "express";

/**
 * Some utilities, no biggie.
 */
export abstract class Util {
    /**
     * Reads a file stream and returns it as a `Buffer`.
     *
     * @param stream The stream.
     */
    static readFile(stream: ReadStream): Promise<Buffer> {
        const chunks: Buffer[] = [];

        return new Promise((resolve, reject) => {
            stream.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
            stream.on("error", (err) => reject(err));
            stream.on("end", () => resolve(Buffer.concat(chunks)));
        });
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
            res.status(400).json({
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
            res.status(400).json({
                message: "Please enter the correct API key.",
            });

            return;
        }

        next();
    }
}
