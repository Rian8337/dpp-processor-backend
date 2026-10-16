import { createHash } from "node:crypto";

/**
 * Computes the MD5 hash of a string (encoded as UTF-8) or buffer, as lowercase hex.
 */
export function md5(content: string | Buffer): string {
    return createHash("md5").update(content).digest("hex");
}
