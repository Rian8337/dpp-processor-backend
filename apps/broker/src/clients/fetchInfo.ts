import type { CalculatorAlgorithm, InfoResponse } from "@dpp/shared";
import { Modes } from "@rian8337/osu-base";
import { z } from "zod";
import type { InfoResult } from "./IProcessorClient";
import { createTimeout } from "./timeout";

const algorithms = [
    "live",
    "rebalance",
] as const satisfies readonly CalculatorAlgorithm[];

const infoSchema = z.object({
    id: z.string(),
    mode: z.enum(Modes),
    algorithm: z.enum(algorithms),
    calculatorVersion: z.string(),
    builtAt: z.string(),
}) satisfies z.ZodType<InfoResponse>;

/**
 * Whether `fetch` failed because a {@link createTimeout} signal fired.
 */
export function isTimeout(error: unknown): boolean {
    return error instanceof DOMException && error.name === "TimeoutError";
}

/**
 * A short reason for a failed `fetch`, preferring the network error's message (e.g. `connect ECONNREFUSED …`)
 * over fetch's generic "fetch failed".
 */
export function describeFetchError(error: unknown): string {
    if (isTimeout(error)) {
        return "timed out";
    }

    if (error instanceof Error) {
        return error.cause instanceof Error
            ? error.cause.message
            : error.message;
    }

    return String(error);
}

/**
 * Calls a processor's public `GET /info`.
 */
export async function fetchInfo(
    baseUrl: string,
    timeoutMs: number,
): Promise<InfoResult> {
    // Covers reading the body too, so it is disposed when the function returns.
    using timeout = createTimeout(timeoutMs);
    let response: Response;

    try {
        response = await fetch(`${baseUrl}/info`, { signal: timeout.signal });
    } catch (e) {
        return { kind: "failed", reason: describeFetchError(e) };
    }

    if (!response.ok) {
        await response.body?.cancel();

        return {
            kind: "failed",
            reason: `GET /info returned ${response.status.toString()}`,
        };
    }

    let body: unknown;

    try {
        body = await response.json();
    } catch (e) {
        return { kind: "failed", reason: describeFetchError(e) };
    }

    const parsed = infoSchema.safeParse(body);

    return parsed.success
        ? { kind: "ok", info: parsed.data }
        : { kind: "failed", reason: "GET /info returned an unexpected body" };
}
