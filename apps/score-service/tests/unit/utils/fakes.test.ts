import { InMemoryOfficialScoreRepository } from "@test/utils/fakes";
import { bestScoreRow } from "@test/utils/rows";
import { describe, expect, it } from "vitest";

describe("InMemoryOfficialScoreRepository", () => {
    it("restores every table when the transaction throws", async () => {
        const repository = new InMemoryOfficialScoreRepository();

        repository.bestScores = [bestScoreRow({ id: 1 })];

        await expect(
            repository.transaction(async (tx) => {
                await tx.deleteBestScores(7, bestScoreRow().hash);
                throw new Error("rollback");
            }),
        ).rejects.toThrow("rollback");

        expect(repository.bestScores.map((s) => s.id)).toEqual([1]);
    });

    it("keeps the changes when the transaction succeeds", async () => {
        const repository = new InMemoryOfficialScoreRepository();

        repository.bestScores = [bestScoreRow({ id: 1 })];

        await repository.transaction((tx) =>
            tx.deleteBestScores(7, bestScoreRow().hash),
        );

        expect(repository.bestScores).toEqual([]);
    });
});
