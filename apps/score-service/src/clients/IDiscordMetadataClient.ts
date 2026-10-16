export interface IDiscordMetadataClient {
    /**
     * Whether the update was accepted. Never throws.
     */
    update(discordId: string): Promise<boolean>;
}
