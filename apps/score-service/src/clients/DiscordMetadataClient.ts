import type { Config } from "@/config/config";
import { dependencyTokens } from "@/dependencies/tokens";
import { Injectable } from "@dpp/server";
import { inject } from "tsyringe";
import type { IDiscordMetadataClient } from "./IDiscordMetadataClient";

@Injectable(dependencyTokens.discordMetadataClient)
export class DiscordMetadataClient implements IDiscordMetadataClient {
    constructor(
        @inject(dependencyTokens.config) private readonly config: Config,
    ) {}

    async update(discordId: string): Promise<boolean> {
        const { url, key } = this.config.discordMetadata;

        try {
            const response = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ key, userId: discordId }),
                signal: AbortSignal.timeout(10_000),
            });

            await response.body?.cancel();

            return response.ok;
        } catch {
            return false;
        }
    }
}
