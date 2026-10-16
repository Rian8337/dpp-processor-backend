import type { IUserBindRepository } from "@/repositories/IUserBindRepository";

export class InMemoryUserBindRepository implements IUserBindRepository {
    readonly binds = new Map<number, string>();

    findDiscordId(uid: number) {
        return Promise.resolve(this.binds.get(uid) ?? null);
    }
}
