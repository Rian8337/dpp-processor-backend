CREATE TABLE "difficulty_attributes" (
	"calculator_version" text NOT NULL,
	"beatmap_hash" char(32) NOT NULL,
	"mods" text NOT NULL,
	"attributes" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "difficulty_attributes_calculator_version_beatmap_hash_mods_pk" PRIMARY KEY("calculator_version","beatmap_hash","mods")
);
