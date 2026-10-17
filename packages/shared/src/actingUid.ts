/**
 * The largest value of a signed 32-bit integer column; the upper bound of a uid and of a rate limit.
 */
export const maxInt32 = 2147483647;

/**
 * Reads the value of an `X-Acting-Uid` header.
 *
 * @param value The raw header value, `undefined` if the header was not sent.
 * @returns `undefined` if the header was not sent, the uid if it is a positive 32-bit integer, or `"invalid"`.
 */
export function parseActingUid(
    value: string | undefined,
): number | undefined | "invalid" {
    if (value === undefined) {
        return undefined;
    }

    const uid = /^[1-9][0-9]*$/.test(value) ? Number(value) : NaN;

    return uid <= maxInt32 ? uid : "invalid";
}
