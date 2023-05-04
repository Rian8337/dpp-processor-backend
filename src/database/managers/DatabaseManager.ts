import { Db, MongoClient } from "mongodb";
import { AliceDBCollection } from "./AliceDBCollection";
import { ElainaDBCollection } from "./ElainaDBCollection";

/**
 * A manager for database.
 */
export abstract class DatabaseManager {
    /**
     * Manager for Elaina DB.
     */
    static elainaDb: {
        /**
         * The instance of the database.
         */
        instance: Db;

        /**
         * The collections from Elaina DB.
         */
        collections: ElainaDBCollection;
    };

    /**
     * Manager for Alice DB.
     */
    static aliceDb: {
        /**
         * The instance of the database.
         */
        instance: Db;

        /**
         * The collections from Alice DB.
         */
        collections: AliceDBCollection;
    };

    /**
     * Initializes the manager.
     */
    static async init(): Promise<void> {
        await this.initElainaDB();
        await this.initAliceDB();
    }

    private static async initElainaDB(): Promise<void> {
        const elainaURI =
            "mongodb://" +
            process.env.ELAINA_DB_KEY +
            "@elainaDb-shard-00-00-r6qx3.mongodb.net:27017,elainaDb-shard-00-01-r6qx3.mongodb.net:27017,elainaDb-shard-00-02-r6qx3.mongodb.net:27017/test?ssl=true&replicaSet=ElainaDB-shard-0&authSource=admin&retryWrites=true";

        const elainaDb = await new MongoClient(elainaURI).connect();

        const db = elainaDb.db("ElainaDB");

        this.elainaDb = {
            instance: db,
            collections: new ElainaDBCollection(db),
        };
    }

    private static async initAliceDB(): Promise<void> {
        const aliceURI =
            "mongodb+srv://" +
            process.env.ALICE_DB_KEY +
            "@aliceDb-hoexz.gcp.mongodb.net/test?retryWrites=true&w=majority";

        const aliceDb = await new MongoClient(aliceURI).connect();

        const db = aliceDb.db("AliceDB");

        this.aliceDb = {
            instance: db,
            collections: new AliceDBCollection(db),
        };
    }
}
