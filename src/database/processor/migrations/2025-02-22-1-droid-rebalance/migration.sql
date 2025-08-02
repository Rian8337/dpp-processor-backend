-- Add aim_difficult_slider_count to live osu!droid table
ALTER TABLE live_droid_difficulty_attributes ADD COLUMN IF NOT EXISTS aim_difficult_slider_count float NOT NULL;