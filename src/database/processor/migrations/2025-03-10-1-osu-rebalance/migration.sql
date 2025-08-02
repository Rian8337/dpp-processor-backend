-- Add aim_difficult_slider_count to both osu!standard tables
ALTER TABLE live_osu_difficulty_attributes ADD COLUMN IF NOT EXISTS aim_difficult_slider_count float NOT NULL;
ALTER TABLE rebalance_osu_difficulty_attributes ADD COLUMN IF NOT EXISTS aim_difficult_slider_count float NOT NULL;