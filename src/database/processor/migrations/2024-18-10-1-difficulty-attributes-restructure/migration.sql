-- Remove approach_rate from live and rebalance osu!droid tables
ALTER TABLE live_droid_difficulty_attributes DROP COLUMN IF EXISTS approach_rate;
ALTER TABLE rebalance_droid_difficulty_attributes DROP COLUMN IF EXISTS approach_rate;

-- Add aim_difficult_strain_count and speed_difficult_strain_count to rebalance osu!standard table
ALTER TABLE rebalance_osu_difficulty_attributes
    ADD COLUMN IF NOT EXISTS aim_difficult_strain_count float NOT NULL,
    ADD COLUMN IF NOT EXISTS speed_difficult_strain_count float NOT NULL;