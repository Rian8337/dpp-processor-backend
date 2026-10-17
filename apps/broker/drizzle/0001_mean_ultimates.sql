CREATE TABLE "user_variants" (
	"uid" integer NOT NULL,
	"variant_name" text NOT NULL,
	CONSTRAINT "user_variants_uid_variant_name_pk" PRIMARY KEY("uid","variant_name")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"uid" integer PRIMARY KEY NOT NULL,
	"role" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_role_check" CHECK (role in ('admin', 'manager'))
);
--> statement-breakpoint
ALTER TABLE "api_keys" ADD COLUMN "can_act_for_users" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "variants" ADD COLUMN "title" text;--> statement-breakpoint
ALTER TABLE "user_variants" ADD CONSTRAINT "user_variants_uid_users_uid_fk" FOREIGN KEY ("uid") REFERENCES "public"."users"("uid") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_variants" ADD CONSTRAINT "user_variants_variant_name_variants_name_fk" FOREIGN KEY ("variant_name") REFERENCES "public"."variants"("name") ON DELETE cascade ON UPDATE no action;