/* eslint-disable @typescript-eslint/no-unused-vars */

namespace NodeJS {
    interface ProcessEnv {
        /**
         * The API key for the osu! API.
         */
        readonly OSU_API_KEY?: string;

        /**
         * The API key for the osu!droid API.
         */
        readonly DROID_API_KEY?: string;

        /**
         * The database key for Elaina database.
         */
        readonly ELAINA_DB_KEY?: string;

        /**
         * The database key for Alice database.
         */
        readonly ALICE_DB_KEY?: string;

        /**
         * The API key for the Discord OAuth2 backend.
         */
        readonly DISCORD_OAUTH_BACKEND_INTERNAL_KEY?: string;

        /**
         * The API key for the osu!droid server.
         */
        readonly DROID_SERVER_INTERNAL_KEY?: string;

        /**
         * The hostname of the database for the processor.
         */
        readonly PROCESSOR_DB_HOSTNAME?: string;

        /**
         * The port of the database for the processor.
         */
        readonly PROCESSOR_DB_PORT?: string;

        /**
         * The name of the database for the processor.
         */
        readonly PROCESSOR_DB_NAME?: string;

        /**
         * The username of the database for the processor.
         */
        readonly PROCESSOR_DB_USERNAME?: string;

        /**
         * The password of the database for the processor.
         */
        readonly PROCESSOR_DB_PASSWORD?: string;

        /**
         * The hostname of the database for the official server.
         */
        readonly OFFICIAL_DB_HOSTNAME?: string;

        /**
         * The port of the database for the official server.
         */
        readonly OFFICIAL_DB_USERNAME?: string;

        /**
         * The username of the database for the official server.
         */
        readonly OFFICIAL_DB_PASSWORD?: string;

        /**
         * The password of the database for the official server.
         */
        readonly OFFICIAL_DB_NAME?: string;

        /**
         * The prefix of database names in the official server's database.
         */
        readonly OFFICIAL_DB_PREFIX?: string;
    }
}
