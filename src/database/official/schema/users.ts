import {
    bigint,
    float,
    index,
    int,
    mediumint,
    mysqlTable,
    timestamp,
    tinyint,
    varchar,
} from "drizzle-orm/mysql-core";

/**
 * The table for storing users.
 */
export const users = mysqlTable(
    `${process.env.OFFICIAL_DB_PREFIX!}user`,
    {
        /**
         * The ID of the user.
         */
        id: mediumint().primaryKey().autoincrement(),

        /**
         * The username of the user.
         */
        username: varchar({ length: 64 }).notNull().unique("uniq_username"),

        /**
         * The hashed password of the user.
         */
        password: varchar({ length: 32 }).notNull(),

        /**
         * The email address of the user.
         */
        email: varchar({ length: 128 }).notNull(),

        /**
         * The device ID of the user.
         */
        deviceid: varchar({ length: 255 }),

        /**
         * The total score of the user.
         */
        score: bigint({ mode: "number" }).notNull().default(0),

        /**
         * The total pp (performance points) of the user.
         */
        pp: float().notNull().default(0),

        /**
         * The amount of plays the user has made.
         */
        playcount: int().notNull().default(0),

        /**
         * The overall accuracy of the user.
         */
        accuracy: float().notNull().default(1),

        /**
         * The time when the user registered.
         */
        registTime: timestamp().defaultNow(),

        /**
         * The last time the user logged in.
         */
        lastLoginTime: timestamp().defaultNow(),

        /**
         * The IP address the user registered from.
         */
        registIP: varchar("regist_ip", { length: 16 }),

        /**
         * The region of the user.
         */
        region: varchar({ length: 3 }).default("de"),

        /**
         * Whether the user is active.
         */
        active: tinyint().default(1),

        /**
         * Whether the user is a supporter.
         */
        supporter: tinyint().default(0),

        /**
         * Whether the user is banned.
         */
        banned: tinyint().default(0),

        /**
         * Whether the user is restricted.
         */
        restrictMode: tinyint().default(0),

        /**
         * Whether the user is archived.
         */
        archived: tinyint().default(0),
    },
    (table) => [index("idx_id").on(table.id)],
);

export type IUser = typeof users.$inferSelect;
export type IUserInsert = typeof users.$inferInsert;
