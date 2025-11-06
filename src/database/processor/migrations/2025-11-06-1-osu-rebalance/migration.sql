-- Add drain_rate, aim_top_weighted_slider_factor, and speed_top_weighted_slider_factor to both osu!standard tables
ALTER TABLE live_osu_difficulty_attributes ADD COLUMN drain_rate float NOT NULL;
ALTER TABLE live_osu_difficulty_attributes ADD COLUMN aim_top_weighted_slider_factor float NOT NULL;
ALTER TABLE live_osu_difficulty_attributes ADD COLUMN speed_top_weighted_slider_factor float NOT NULL;

ALTER TABLE rebalance_osu_difficulty_attributes ADD COLUMN drain_rate float NOT NULL;
ALTER TABLE rebalance_osu_difficulty_attributes ADD COLUMN aim_top_weighted_slider_factor float NOT NULL;
ALTER TABLE rebalance_osu_difficulty_attributes ADD COLUMN speed_top_weighted_slider_factor float NOT NULL;