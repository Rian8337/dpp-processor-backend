import { MongoMemoryServer } from "mongodb-memory-server";

/**
 * A throwaway MongoDB server (a real `mongod`, downloaded once and cached). Every test file gets its own, so the
 * fixed database names (`AliceDB`, `ElainaDB`) are safe to use. Disposing stops it and deletes its data.
 */
export interface TestMongo extends AsyncDisposable {
    readonly uri: string;
}

export async function startTestMongo(): Promise<TestMongo> {
    const server = await MongoMemoryServer.create();

    return {
        uri: server.getUri(),
        [Symbol.asyncDispose]: async () => {
            await server.stop({ doCleanup: true });
        },
    };
}
