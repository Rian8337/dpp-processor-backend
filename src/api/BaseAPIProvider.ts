/**
 * Provides a base implementation for API providers.
 */
export abstract class BaseAPIProvider {
    /**
     * Fetches JSON data from the given URL.
     *
     * @param url The URL to fetch data from.
     * @param init Optional request initialization parameters.
     * @returns The JSON data.
     */
    protected async fetchJSON<T>(url: URL, init?: RequestInit): Promise<T> {
        this.onRequestPrepare(url);

        return fetch(url, init).then((res) => {
            if (!res.ok) {
                throw this.createRequestFailError(res);
            }

            return res.json() as Promise<T>;
        });
    }

    /**
     * Fetches a Buffer from the given URL.
     *
     * @param url The URL to fetch the Buffer from.
     * @param init Optional request initialization parameters.
     * @returns The fetched Buffer.
     */
    protected async fetchBuffer(url: URL, init?: RequestInit): Promise<Buffer> {
        this.onRequestPrepare(url);

        return fetch(url, init)
            .then((res) => {
                if (!res.ok) {
                    throw this.createRequestFailError(res);
                }

                return res.arrayBuffer();
            })
            .then((buffer) => Buffer.from(buffer));
    }

    /**
     * Creates an error for a failed request.
     *
     * @param res The response object from the failed request.
     * @returns An error object with the status and status text.
     */
    protected createRequestFailError(res: Response): Error {
        return new Error(
            `Request failed with status ${res.status.toString()} (${res.statusText})`,
        );
    }

    /**
     * Called before a request is sent.
     *
     * @param url The URL that will be requested.
     */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars, @typescript-eslint/no-empty-function
    protected onRequestPrepare(url: URL) {}
}
