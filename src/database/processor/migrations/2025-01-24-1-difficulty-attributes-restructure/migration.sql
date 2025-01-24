-- Remove average_speed_delta_time and vibro_factor from rebalance osu!droid table
ALTER TABLE rebalance_droid_difficulty_attributes DROP COLUMN IF EXISTS average_speed_delta_time;
ALTER TABLE rebalance_droid_difficulty_attributes DROP COLUMN IF EXISTS vibro_factor;

-- Add aim_difficult_slider_count to rebalance osu!droid table
ALTER TABLE rebalance_droid_difficulty_attributes
    ADD COLUMN IF NOT EXISTS aim_difficult_slider_count float NOT NULL;