import "dotenv/config";
import { desc, eq } from "drizzle-orm";
import { officialDb } from "./database/official";
import { bestScoresTable, usersTable } from "./database/official/schema";
import { processorDb } from "./database/processor";
import { totalPPCalculationTable } from "./database/processor/schema";

(async () => {
    let id = await processorDb
        .select()
        .from(totalPPCalculationTable)
        .then((res) => res.at(0)?.id ?? null)
        .catch((e: unknown) => {
            console.error(e);

            return null;
        });

    if (id === null) {
        id = 2417;

        await processorDb.insert(totalPPCalculationTable).values({ id });
    }

    const timeLimit = Date.now() - 3 * 30 * 24 * 60 * 60 * 1000;

    while (id <= 500000) {
        // Update progress.
        await processorDb.update(totalPPCalculationTable).set({ id });

        const user = await officialDb
            .select({ lastLoginTime: usersTable.lastLoginTime })
            .from(usersTable)
            .where(eq(usersTable.id, id))
            .limit(1)
            .then((res) => res.at(0) ?? null)
            .catch((e: unknown) => {
                console.error(e);
                return null;
            });

        if (!user) {
            console.log("User", id++, "does not exist");

            continue;
        }

        // Skip users who have not logged in for 3 months.
        if (user.lastLoginTime && user.lastLoginTime.getTime() < timeLimit) {
            console.log("User", id++, "has not logged in for 3 months");

            await officialDb
                .update(usersTable)
                .set({ pp: 0, accuracy: 1 })
                .where(eq(usersTable.id, id));

            continue;
        }

        // Get user top scores.
        const topScores = await officialDb
            .select({
                pp: bestScoresTable.pp,
                accuracy: bestScoresTable.accuracy,
            })
            .from(bestScoresTable)
            .where(eq(bestScoresTable.uid, id))
            .orderBy(desc(bestScoresTable.pp))
            .limit(100)
            .catch((e: unknown) => {
                console.error(e);

                return null;
            });

        if (!topScores) {
            console.log("User", id++, "has no scores");

            await officialDb
                .update(usersTable)
                .set({ pp: 0, accuracy: 1 })
                .where(eq(usersTable.id, id));

            continue;
        }

        // Calculate total pp and accuracy.
        let totalPP = 0;
        let accuracy = 0;
        let accuracyWeight = 0;

        for (let i = 0; i < topScores.length; ++i) {
            const score = topScores[i];
            const weightMultiplier = Math.pow(0.95, i);

            totalPP += score.pp * weightMultiplier;
            accuracy += score.accuracy * weightMultiplier;
            accuracyWeight += weightMultiplier;
        }

        if (accuracyWeight > 0) {
            accuracy /= accuracyWeight;
        } else {
            accuracy = 1;
        }

        // Update total pp and accuracy.
        await officialDb
            .update(usersTable)
            .set({ pp: totalPP, accuracy })
            .where(eq(usersTable.id, id));

        console.log(
            "User",
            id++,
            "has",
            totalPP,
            "pp and",
            accuracy,
            "accuracy",
        );
    }
})()
    .then(() => {
        console.log("Done");
    })
    .catch((e: unknown) => {
        console.error(e);
    });
