import {
    integer,
    pgTable,
    primaryKey,
    text,
    timestamp,
} from "drizzle-orm/pg-core";

/**
 * Recalculation jobs. A job is identified by its name; re-running a name resumes it.
 */
export const jobsTable = pgTable("jobs", {
    name: text().primaryKey(),
    kind: text({ enum: ["scores", "total-pp"] }).notNull(),
    rangeFrom: integer().notNull(),
    rangeTo: integer().notNull(),
    chunkSize: integer().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

/**
 * A job's ID range split into chunks. Workers claim pending chunks; a chunk in progress keeps the last ID it
 * processed, so an interrupted run resumes after it.
 */
export const jobChunksTable = pgTable(
    "job_chunks",
    {
        jobName: text()
            .notNull()
            .references(() => jobsTable.name, { onDelete: "cascade" }),
        start: integer().notNull(),
        end: integer().notNull(),
        status: text({ enum: ["pending", "in_progress", "done"] })
            .notNull()
            .default("pending"),
        worker: integer(),
        lastProcessedId: integer(),
        updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    },
    (table) => [primaryKey({ columns: [table.jobName, table.start] })],
);

export const schema = { jobsTable, jobChunksTable };
