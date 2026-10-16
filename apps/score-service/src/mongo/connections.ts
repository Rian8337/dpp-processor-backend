import { MongoClient, type Db } from "mongodb";

/**
 * Both MongoDB clusters. Disposing closes both clients.
 */
export class MongoConnections implements AsyncDisposable {
    private constructor(
        private readonly clients: readonly MongoClient[],
        readonly aliceDb: Db,
        readonly elainaDb: Db,
    ) {}

    /**
     * Connects to both clusters. If the second connection fails, the first is closed before rethrowing.
     */
    static async connect(settings: {
        aliceUri: string;
        elainaUri: string;
    }): Promise<MongoConnections> {
        const alice = await MongoClient.connect(settings.aliceUri);

        try {
            const elaina = await MongoClient.connect(settings.elainaUri);

            return new MongoConnections(
                [alice, elaina],
                alice.db("AliceDB"),
                elaina.db("ElainaDB"),
            );
        } catch (e) {
            await alice.close();
            throw e;
        }
    }

    async [Symbol.asyncDispose](): Promise<void> {
        await Promise.all(this.clients.map((client) => client.close()));
    }
}
