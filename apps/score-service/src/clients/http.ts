import {
    failureFromResponse,
    malformed,
    unreachable,
    type UpstreamResult,
} from "@/types/upstream";
import { errorCodes, type ErrorCode } from "@dpp/shared";
import { z } from "zod";

export interface JsonRequest {
    readonly url: string;
    readonly method?: "GET" | "POST";
    readonly headers?: Record<string, string>;
    readonly body?: unknown;
    readonly timeoutMs: number;

    /**
     * Named in failure messages, e.g. "Broker".
     */
    readonly service: string;

    /**
     * For failures without an error code in the body (unreachable, non-JSON errors).
     */
    readonly fallbackCode: ErrorCode;

    /**
     * For 2xx bodies that do not match the schema.
     */
    readonly malformedCode: ErrorCode;
}

const errorBodySchema = z.object({
    error: z.object({ code: z.string(), message: z.string() }),
});

function isErrorCode(code: string): code is ErrorCode {
    return (errorCodes as readonly string[]).includes(code);
}

/**
 * Sends a request and validates a JSON response. Never throws: every failure is classified (see `UpstreamFailure`).
 */
export async function requestJson<T>(
    request: JsonRequest,
    schema: z.ZodType<T>,
): Promise<UpstreamResult<T>> {
    let response: Response;

    try {
        response = await fetch(request.url, {
            method: request.method ?? "GET",
            headers: {
                ...(request.body !== undefined && {
                    "Content-Type": "application/json",
                }),
                ...request.headers,
            },
            body:
                request.body === undefined
                    ? undefined
                    : JSON.stringify(request.body),
            signal: AbortSignal.timeout(request.timeoutMs),
        });
    } catch (e) {
        return unreachable(
            request.fallbackCode,
            e instanceof Error && e.name === "TimeoutError"
                ? `${request.service} did not respond in time`
                : `${request.service} is unreachable`,
        );
    }

    let body: unknown;

    try {
        body = await response.json();
    } catch (e) {
        if (e instanceof Error && e.name === "TimeoutError") {
            return unreachable(
                request.fallbackCode,
                `${request.service} did not respond in time`,
            );
        }

        body = undefined;
    }

    if (!response.ok) {
        const error = errorBodySchema.safeParse(body);

        return failureFromResponse(
            response,
            error.success && isErrorCode(error.data.error.code)
                ? error.data.error.code
                : request.fallbackCode,
            error.success
                ? error.data.error.message
                : `${request.service} responded with status ${response.status.toString()}`,
        );
    }

    const parsed = schema.safeParse(body);

    return parsed.success
        ? { ok: true, value: parsed.data }
        : malformed(
              request.malformedCode,
              `${request.service} returned an unexpected response`,
          );
}
