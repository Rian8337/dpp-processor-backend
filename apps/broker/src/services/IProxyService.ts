import type { Variant } from "@/registry/types";
import type { ProcessorRoute } from "@dpp/shared";

export interface ProxyResponse {
    readonly status: number;
    /** The processor's JSON body, unchanged. */
    readonly body: Buffer;
}

export interface IProxyService {
    /**
     * Forwards a request body to one of the variant's healthy instances.
     *
     * @throws {VariantUnavailableError} No healthy instance.
     * @throws {ProcessorError} Connection failed after the retry, broken or non-JSON response, or the processor
     * rejected the broker's key.
     * @throws {ProcessorTimeoutError} No response within `PROCESSOR_TIMEOUT_SECONDS`.
     */
    forward(
        variant: Variant,
        route: ProcessorRoute,
        body: Buffer,
    ): Promise<ProxyResponse>;
}
