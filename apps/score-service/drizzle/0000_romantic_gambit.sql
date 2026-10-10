CREATE TABLE "job_chunks" (
	"job_name" text NOT NULL,
	"start" integer NOT NULL,
	"end" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"worker" integer,
	"last_processed_id" integer,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "job_chunks_job_name_start_pk" PRIMARY KEY("job_name","start")
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"name" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"range_from" integer NOT NULL,
	"range_to" integer NOT NULL,
	"chunk_size" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "job_chunks" ADD CONSTRAINT "job_chunks_job_name_jobs_name_fk" FOREIGN KEY ("job_name") REFERENCES "public"."jobs"("name") ON DELETE cascade ON UPDATE no action;