import { maxInt32 } from "@dpp/shared";

/**
 * Whether a number can be a user id: a positive integer that fits a 32-bit signed column.
 */
export function isValidUid(uid: number): boolean {
    return Number.isSafeInteger(uid) && uid >= 1 && uid <= maxInt32;
}
