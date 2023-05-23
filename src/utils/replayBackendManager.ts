/**
 * The base URL of the replay backend.
 */
export const baseURL = new URL("http://127.0.0.1:3005");

/**
 * Gets an online replay file from the replay backend.
 *
 * @param scoreId The ID of the score associated with the replay.
 * @returns The replay file, `null` if not found or the request to the server failed.
 */
export async function getOnlineReplay(
    scoreId: string | number
): Promise<Buffer | null> {
    const url = new URL(`${baseURL}/get-online-replay`);
    url.searchParams.set("scoreId", scoreId.toString());

    const res = await fetch(url).catch(() => null);
    if (!res) {
        return null;
    }

    return Buffer.from(await res.arrayBuffer());
}
