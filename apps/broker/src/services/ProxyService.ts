import type {
    ForwardResult,
    IProcessorClient,
} from "@/clients/IProcessorClient";
import type { Config } from "@/config/config";
import { dependencyTokens } from "@/dependencies/tokens";
import type { Instance, Variant } from "@/registry/types";
import {
    ProcessorError,
    ProcessorTimeoutError,
    VariantUnavailableError,
} from "@/types/errors";
import { Injectable } from "@dpp/server";
import type { ProcessorRoute } from "@dpp/shared";
import { inject } from "tsyringe";
import type { IHealthMonitor } from "./IHealthMonitor";
import type { IInstanceSelector } from "./IInstanceSelector";
import type { IProxyService, ProxyResponse } from "./IProxyService";

type Answered = Exclude<ForwardResult, { kind: "connection-failed" }>;

@Injectable(dependencyTokens.proxyService)
export class ProxyService implements IProxyService {
    constructor(
        @inject(dependencyTokens.processorClient)
        private readonly client: IProcessorClient,
        @inject(dependencyTokens.instanceSelector)
        private readonly selector: IInstanceSelector,
        @inject(dependencyTokens.healthMonitor)
        private readonly health: Pick<IHealthMonitor, "markDown">,
        @inject(dependencyTokens.config)
        private readonly config: Config,
    ) {}

    async forward(
        variant: Variant,
        route: ProcessorRoute,
        body: Buffer,
    ): Promise<ProxyResponse> {
        const first = this.selector.select(variant);

        if (!first) {
            throw new VariantUnavailableError(variant.name);
        }

        const result = await this.send(first, route, body);

        if (result.kind !== "connection-failed") {
            return this.toResponse(variant, first, result);
        }

        // Nothing reached the processor, and calculations are pure, so another instance can safely take it.
        this.health.markDown(first, result.reason);

        const second = this.selector.select(variant, first);

        if (!second) {
            throw this.unreachable(variant);
        }

        const retried = await this.send(second, route, body);

        if (retried.kind === "connection-failed") {
            this.health.markDown(second, retried.reason);

            throw this.unreachable(variant);
        }

        return this.toResponse(variant, second, retried);
    }

    private send(
        instance: Instance,
        route: ProcessorRoute,
        body: Buffer,
    ): Promise<ForwardResult> {
        return this.client.forward(
            instance.url,
            route,
            body,
            this.config.processor.timeoutSeconds * 1000,
        );
    }

    private toResponse(
        variant: Variant,
        instance: Instance,
        result: Answered,
    ): ProxyResponse {
        const source = `Processor at ${instance.url} (${variant.name})`;

        switch (result.kind) {
            case "timeout":
                console.warn(
                    `${source} did not respond within ${this.config.processor.timeoutSeconds.toString()} s`,
                );

                throw new ProcessorTimeoutError(variant.name);
            case "broken":
                console.error(
                    `${source} broke off its response: ${result.reason}`,
                );

                throw new ProcessorError(
                    `The processor for variant "${variant.name}" failed while responding`,
                );
            case "response":
                if (result.status === 401) {
                    console.error(
                        `${source} rejected the broker's key; check that PROCESSOR_API_KEY matches its API_KEY`,
                    );

                    throw new ProcessorError(
                        `The processor for variant "${variant.name}" rejected the broker`,
                    );
                }

                if (!result.contentType?.startsWith("application/json")) {
                    console.error(
                        `${source} returned a non-JSON response with status ${result.status.toString()}`,
                    );

                    throw new ProcessorError(
                        `The processor for variant "${variant.name}" returned an invalid response`,
                    );
                }

                return { status: result.status, body: result.body };
        }
    }

    private unreachable(variant: Variant): ProcessorError {
        return new ProcessorError(
            `Could not connect to a processor for variant "${variant.name}"`,
        );
    }
}
