ALTER TABLE live_droid_difficulty_attributes
    DROP COLUMN IF EXISTS flashlight_difficult_strain_count,
    DROP COLUMN IF EXISTS flashlight_slider_factor,
    DROP COLUMN IF EXISTS flashlight_top_weighted_slider_factor,
    DROP COLUMN IF EXISTS reading_top_weighted_slider_factor,
    DROP COLUMN IF EXISTS average_speed_delta_time,
    DROP COLUMN IF EXISTS vibro_factor,
    ADD COLUMN aim_top_weighted_slider_factor float NOT NULL,
    ADD COLUMN tap_top_weighted_slider_factor float NOT NULL,
    ADD COLUMN maximum_score int NOT NULL;