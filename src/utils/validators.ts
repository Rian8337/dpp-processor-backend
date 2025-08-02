import { Modes } from "@rian8337/osu-base";

/**
 * Validates an MD5 hash. Errors will be thrown if the hash is not valid.
 *
 * @param hash The MD5 hash to validate.
 */
export function validateMD5Hash(hash: string) {
    if (hash.length !== 32) {
        throw new RangeError("Hash must be 32 characters long.");
    }

    if (!/^[a-fA-F0-9]+$/.test(hash)) {
        throw new Error("Hash must contain only hexadecimal characters.");
    }
}

/**
 * Validates an osu!droid account user ID. Errors will be thrown if the ID is not valid.
 *
 * @param id The user ID to validate.
 */
export function validateUserId(id: number) {
    if (!Number.isInteger(id)) {
        throw new TypeError("User ID must be an integer.");
    }

    if (id < 2417 || id > 500000) {
        throw new RangeError("User ID must be between 2417 and 500000.");
    }
}

/**
 * Validates a score ID. Errors will be thrown if the ID is not valid.
 *
 * @param id The score ID to validate.
 */
export function validateScoreId(id: number) {
    if (!Number.isInteger(id)) {
        throw new TypeError("Score ID must be an integer.");
    }

    if (id < 207695) {
        throw new RangeError("Score ID must be greater than 207695.");
    }
}
/**
 * Validates a gamemode. Errors will be thrown if the mode is not valid.
 *
 * @param mode The gamemode to validate.
 * @returns Always `true` if no errors are thrown.
 */
export function validateGamemode(mode: string): mode is Modes {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison
    if (mode !== Modes.droid && mode !== Modes.osu) {
        throw new TypeError(
            `Invalid gamemode: ${mode}. Valid modes are: ${Modes.droid}, ${Modes.osu}.`,
        );
    }

    return true;
}
