import type { IDiscordMetadataClient } from "@/clients/IDiscordMetadataClient";

export class FakeDiscordMetadataClient implements IDiscordMetadataClient {
    readonly updates: string[] = [];
    accept = true;

    update(discordId: string) {
        this.updates.push(discordId);

        return Promise.resolve(this.accept);
    }
}
