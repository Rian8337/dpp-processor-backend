import { ReadStream } from "fs";

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
}
