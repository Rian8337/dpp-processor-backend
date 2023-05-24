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

/**
 * Sends a replay to the backend for saving.
 *
 * @param playerId The ID of the player who owns the replay file.
 * @param replayFile The replay file.
 * @returns The name of which the replay file was saved as, `null` if the request failed.
 */
export async function saveReplay(
    playerId: number,
    replayFile: Buffer
): Promise<string | null> {
    const url = new URL(`${baseURL}/save-local-replay`);

    const formData = new FormData();
    formData.append("playerid", playerId.toString());
    formData.append("replayfile", new Blob([replayFile]));

    return fetch(url, {
        method: "POST",
        body: formData,
    })
        .then((res) => res.text())
        .catch(() => null);
}

/**
 * Requests the replay backend to persist a replay.
 *
 * @param filename The name of the replay file.
 * @returns Whether the operation was successful.
 */
export async function persistReplay(filename: string): Promise<boolean> {
    const formData = new FormData();
    formData.append("filename", filename);

    return fetch("http://127.0.0.1:3005/persist-local-replay", {
        method: "POST",
        body: formData,
    })
        .then(() => true)
        .catch(() => false);
}
