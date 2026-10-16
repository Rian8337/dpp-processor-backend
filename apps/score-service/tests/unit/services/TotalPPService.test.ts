import { TotalPPService } from "@/services/TotalPPService";
import { InMemoryOfficialScoreRepository } from "@test/utils/fakes";
import { bestScoreRow } from "@test/utils/rows";
import { beforeEach, describe, expect, it } from "vitest";

const now = new Date("2026-10-10T00:00:00Z");
const day = 24 * 60 * 60 * 1000;

describe("TotalPPService", () => {
    let official: InMemoryOfficialScoreRepository;
    let service: TotalPPService;

    function user(id: number, lastLoginTime: Date | null) {
        return {
            id,
            username: `u${id.toString()}`,
            pp: 5,
            accuracy: 0.5,
            lastLoginTime,
        };
    }

    beforeEach(() => {
        official = new InMemoryOfficialScoreRepository();
        service = new TotalPPService(official);
    });

    it("writes nothing for an unknown user", async () => {
        official.users.push(user(8, null));

        await service.recalculate(7, now);

        expect(official.users).toEqual([user(8, null)]);
    });

    it("zeroes only the inactive user (not the next one)", async () => {
        official.users.push(
            user(7, new Date(now.getTime() - 91 * day)),
            user(8, null),
        );

        await service.recalculate(7, now);

        expect(official.users[0]).toMatchObject({ pp: 0, accuracy: 1 });
        expect(official.users[1]).toMatchObject({ pp: 5, accuracy: 0.5 });
    });

    it.each([[new Date(now.getTime() - 89 * day)], [null]])(
        "computes totals from the best rows for last login %s",
        async (lastLoginTime) => {
            official.users.push(user(7, lastLoginTime));
            official.bestScores.push(
                bestScoreRow({
                    id: 1,
                    hash: "a".repeat(32),
                    pp: 100,
                    accuracy: 1,
                }),
                bestScoreRow({
                    id: 2,
                    hash: "b".repeat(32),
                    pp: 50,
                    accuracy: 0.5,
                }),
            );

            await service.recalculate(7, now);

            expect(official.users[0]!.pp).toBeCloseTo(100 + 50 * 0.95);
            expect(official.users[0]!.accuracy).toBeCloseTo(
                (1 + 0.5 * 0.95) / 1.95,
            );
        },
    );

    it("gives pp 0 and accuracy 1 without best rows", async () => {
        official.users.push(user(7, null));

        await service.recalculate(7, now);

        expect(official.users[0]).toMatchObject({ pp: 0, accuracy: 1 });
    });
});
