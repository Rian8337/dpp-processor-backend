import { Db, MongoClient } from "mongodb";
import { ElainaDBCollection } from "./ElainaDBCollection";
import { AliceDBCollection } from "./AliceDBCollection";

/**
 * A manager for database.
 */
// eslint-disable-next-line @typescript-eslint/no-extraneous-class
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
        console.log("Connecting to Elaina DB");

        const elainaURI =
            "mongodb://" +
            process.env.ELAINA_DB_KEY! +
            "@elainaDb-shard-00-00-r6qx3.mongodb.net:27017,elainaDb-shard-00-01-r6qx3.mongodb.net:27017,elainaDb-shard-00-02-r6qx3.mongodb.net:27017/test?ssl=true&replicaSet=ElainaDB-shard-0&authSource=admin&retryWrites=true";

        const elainaDb = await new MongoClient(elainaURI, {
            ignoreUndefined: true,
        }).connect();

        const db = elainaDb.db("ElainaDB");

        this.elainaDb = {
            instance: db,
            collections: new ElainaDBCollection(db),
        };

        console.log("Connection to Elaina DB established");
    }

    private static async initAliceDB(): Promise<void> {
        console.log("Connecting to Alice DB");

        const aliceURI =
            "mongodb+srv://" +
            process.env.ALICE_DB_KEY! +
            "@alicedb-hoexz.gcp.mongodb.net/test?retryWrites=true&w=majority";
        const aliceDb = await new MongoClient(aliceURI, {
            ignoreUndefined: true,
        }).connect();

        const db = aliceDb.db("AliceDB");

        this.aliceDb = {
            instance: db,
            collections: new AliceDBCollection(db),
        };

        console.log("Connection to Alice DB established");
    }
}
