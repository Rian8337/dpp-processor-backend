CREATE TABLE "aliases" (
	"name" text PRIMARY KEY NOT NULL,
	"variant_name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "api_key_variants" (
	"key_id" integer NOT NULL,
	"variant_name" text NOT NULL,
	CONSTRAINT "api_key_variants_key_id_variant_name_pk" PRIMARY KEY("key_id","variant_name")
);
--> statement-breakpoint
CREATE TABLE "api_keys" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"key_hash" char(64) NOT NULL,
	"rate_limit_per_minute" integer,
	"all_variants" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "api_keys_name_unique" UNIQUE("name"),
	CONSTRAINT "api_keys_key_hash_unique" UNIQUE("key_hash")
);
--> statement-breakpoint
CREATE TABLE "variant_instances" (
	"id" serial PRIMARY KEY NOT NULL,
	"variant_name" text NOT NULL,
	"url" text NOT NULL,
	CONSTRAINT "variant_instances_variant_name_url_unique" UNIQUE("variant_name","url")
);
--> statement-breakpoint
CREATE TABLE "variants" (
	"name" text PRIMARY KEY NOT NULL,
	"public" boolean DEFAULT false NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "aliases" ADD CONSTRAINT "aliases_variant_name_variants_name_fk" FOREIGN KEY ("variant_name") REFERENCES "public"."variants"("name") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_key_variants" ADD CONSTRAINT "api_key_variants_key_id_api_keys_id_fk" FOREIGN KEY ("key_id") REFERENCES "public"."api_keys"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_key_variants" ADD CONSTRAINT "api_key_variants_variant_name_variants_name_fk" FOREIGN KEY ("variant_name") REFERENCES "public"."variants"("name") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variant_instances" ADD CONSTRAINT "variant_instances_variant_name_variants_name_fk" FOREIGN KEY ("variant_name") REFERENCES "public"."variants"("name") ON DELETE cascade ON UPDATE no action;