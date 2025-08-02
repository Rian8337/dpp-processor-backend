-- Rename table beatmap_last_update to beatmap
ALTER TABLE beatmap_last_update RENAME TO beatmap;

-- Add new columns to beatmap table with default values
ALTER TABLE beatmap
    ADD COLUMN IF NOT EXISTS hash varchar(32) NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS title text NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS hit_length int NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS total_length int NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS max_combo int NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS object_count int NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS ranked_status smallint NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS last_checked timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Drop the default values
ALTER TABLE beatmap
    ALTER COLUMN hash DROP DEFAULT,
    ALTER COLUMN title DROP DEFAULT,
    ALTER COLUMN hit_length DROP DEFAULT,
    ALTER COLUMN total_length DROP DEFAULT,
    ALTER COLUMN max_combo DROP DEFAULT,
    ALTER COLUMN object_count DROP DEFAULT,
    ALTER COLUMN ranked_status DROP DEFAULT,
    ALTER COLUMN last_checked DROP DEFAULT;

-- Create index for the hash column
CREATE INDEX IF NOT EXISTS beatmap_hash_idx ON beatmap(hash);

-- Remove the last_update column from the beatmap table
ALTER TABLE beatmap DROP COLUMN IF EXISTS last_update;

-- Rename indices to match the new table name
ALTER INDEX beatmap_last_update_id_idx RENAME TO beatmap_id_idx;

-- Rename primary key index
ALTER TABLE beatmap RENAME CONSTRAINT beatmap_last_update_pkey TO beatmap_pkey;

-- Change constraints in difficulty attributes table to apply on delete cascade operation
ALTER TABLE live_droid_difficulty_attributes
    DROP CONSTRAINT IF EXISTS fk_live_droid_difficulty_attributes_beatmap_id,
    ADD CONSTRAINT fk_live_droid_difficulty_attributes_beatmap_id FOREIGN KEY (beatmap_id) REFERENCES beatmap(id) ON DELETE CASCADE;

ALTER TABLE rebalance_droid_difficulty_attributes
    DROP CONSTRAINT IF EXISTS fk_rebalance_droid_difficulty_attributes_beatmap_id,
    ADD CONSTRAINT fk_rebalance_droid_difficulty_attributes_beatmap_id FOREIGN KEY (beatmap_id) REFERENCES beatmap(id) ON DELETE CASCADE;

ALTER TABLE live_osu_difficulty_attributes
    DROP CONSTRAINT IF EXISTS fk_live_osu_difficulty_attributes_beatmap_id,
    ADD CONSTRAINT fk_live_osu_difficulty_attributes_beatmap_id FOREIGN KEY (beatmap_id) REFERENCES beatmap(id) ON DELETE CASCADE;

ALTER TABLE rebalance_osu_difficulty_attributes
    DROP CONSTRAINT IF EXISTS fk_rebalance_osu_difficulty_attributes_beatmap_id,
    ADD CONSTRAINT fk_rebalance_osu_difficulty_attributes_beatmap_id FOREIGN KEY (beatmap_id) REFERENCES beatmap(id) ON DELETE CASCADE;