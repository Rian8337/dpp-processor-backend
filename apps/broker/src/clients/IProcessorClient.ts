import type { InfoResponse, ProcessorRoute } from "@dpp/shared";

export type InfoResult =
    | { readonly kind: "ok"; readonly info: InfoResponse }
    | { readonly kind: "failed"; readonly reason: string };

export type ForwardResult =
    /** The processor answered; status and body are passed on unchanged. */
    | {
          readonly kind: "response";
          readonly status: number;
          readonly contentType: string | null;
          readonly body: Buffer;
      }
    /** No response arrived: refused, reset, or DNS failure. The only result worth retrying elsewhere. */
    | { readonly kind: "connection-failed"; readonly reason: string }
    /** No complete response within the timeout. */
    | { readonly kind: "timeout" }
    /** The response started but its body could not be read. */
    | { readonly kind: "broken"; readonly reason: string };

export interface IProcessorClient {
    getInfo(baseUrl: string, timeoutMs: number): Promise<InfoResult>;
    forward(
        baseUrl: string,
        route: ProcessorRoute,
        body: Buffer,
        timeoutMs: number,
    ): Promise<ForwardResult>;
}
