import { OfficialDb } from "@/database/official";
import { IUser, users } from "@/database/official/schema";
import { Repository } from "@/decorators/repository";
import { dependencyTokens } from "@/dependencies/tokens";
import { eq } from "drizzle-orm";
import { SelectedFields } from "drizzle-orm/mysql-core";
import { inject } from "tsyringe";
import { BaseOfficialRepository } from "./BaseOfficialRepository";
import { IUserRepository } from "./IUserRepository";
import { validateUserId } from "@/utils/validators";

/**
 * Provides operations for interacting with users in the official database.
 */
@Repository(dependencyTokens.userRepository)
export class UserRepository
    extends BaseOfficialRepository
    implements IUserRepository
{
    constructor(@inject(dependencyTokens.officialDb) db: OfficialDb) {
        super(db);
    }

    async getFromUid<K extends keyof IUser>(
        uid: number,
        ...columns: K[]
    ): Promise<Pick<IUser, K> | null> {
        validateUserId(uid);

        const selectedColumns: SelectedFields = {};

        for (const column of columns) {
            selectedColumns[column] = users[column];
        }

        const select =
            columns.length > 0
                ? this.db.select(selectedColumns)
                : this.db.select();

        return select
            .from(users)
            .where(eq(users.id, uid))
            .limit(1)
            .then((res) => (res.at(0) ?? null) as Pick<IUser, K> | null);
    }

    async getFromUsername<K extends keyof IUser>(
        username: string,
        ...columns: K[]
    ): Promise<Pick<IUser, K> | null> {
        if (username.length < 2 || username.length > 20) {
            throw new Error("Username must be between 2 and 20 characters.");
        }

        const selectedColumns: SelectedFields = {};

        for (const column of columns) {
            selectedColumns[column] = users[column];
        }

        const select =
            columns.length > 0
                ? this.db.select(selectedColumns)
                : this.db.select();

        return select
            .from(users)
            .where(eq(users.username, username))
            .limit(1)
            .then((res) => (res.at(0) ?? null) as Pick<IUser, K> | null);
    }

    async updateRanking(
        uid: number,
        pp: number,
        accuracy: number,
    ): Promise<boolean> {
        validateUserId(uid);

        if (pp < 0) {
            throw new RangeError(
                "Performance points (PP) must be a non-negative number.",
            );
        }

        if (accuracy < 0 || accuracy > 1) {
            throw new RangeError("Accuracy must be between 0 and 1.");
        }

        return this.db
            .update(users)
            .set({ pp, accuracy })
            .where(eq(users.id, uid))
            .then((res) => res[0].affectedRows === 1);
    }

    async resetRanking(uid: number): Promise<boolean> {
        return this.updateRanking(uid, 0, 1);
    }
}
