export interface IUserBindRepository {
    /**
     * The Discord ID bound to the uid (current or previous bind), or null.
     */
    findDiscordId(uid: number): Promise<string | null>;
}
