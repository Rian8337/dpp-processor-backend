import { Db, MongoClient } from "mongodb";

/**
 * Connects to the Elaina database.
 *
 * @returns The connected database instance.
 */
export async function connectToElainaDB(): Promise<Db> {
    if (!process.env.ELAINA_DB_KEY) {
        throw new Error("ELAINA_DB_KEY environment variable is not set.");
    }

    return connectToDB(
        "mongodb://" +
            process.env.ELAINA_DB_KEY +
            "@elainaDb-shard-00-00-r6qx3.mongodb.net:27017,elainaDb-shard-00-01-r6qx3.mongodb.net:27017,elainaDb-shard-00-02-r6qx3.mongodb.net:27017/test?ssl=true&replicaSet=ElainaDB-shard-0&authSource=admin&retryWrites=true",
        "ElainaDB",
    );
}

/**
 * Connects to the Alice database.
 *
 * @returns The connected database instance.
 */
export async function connectToAliceDB(): Promise<Db> {
    if (!process.env.ALICE_DB_KEY) {
        throw new Error("ALICE_DB_KEY environment variable is not set.");
    }

    return connectToDB(
        "mongodb+srv://" +
            process.env.ALICE_DB_KEY +
            "@alicedb-hoexz.gcp.mongodb.net/test?retryWrites=true&w=majority",
        "AliceDB",
    );
}

async function connectToDB(uri: string, dbName: string): Promise<Db> {
    const client = new MongoClient(uri, { ignoreUndefined: true });
    await client.connect();

    return client.db(dbName);
}
