CREATE TABLE IF NOT EXISTS beatmap_last_update (
    id                       int             NOT NULL,
    last_update              timestamp       NOT NULL,

    PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS beatmap_hash_id_idx ON beatmap_hash(id);
CREATE INDEX IF NOT EXISTS beatmap_hash_hash_idx ON beatmap_hash(hash);

CREATE TABLE IF NOT EXISTS live_droid_difficulty_attributes (
    beatmap_id                              int             NOT NULL,
    mods                                    text            NOT NULL,
    speed_multiplier                        real            NOT NULL,
    force_cs                                real            NOT NULL,
    force_ar                                real            NOT NULL,
    force_od                                real            NOT NULL,
    old_statistics                          boolean         NOT NULL,
    tap_difficulty                          float           NOT NULL,
    rhythm_difficulty                       float           NOT NULL,
    visual_difficulty                       float           NOT NULL,
    aim_note_count                          float           NOT NULL,
    star_rating                             float           NOT NULL,
    max_combo                               int             NOT NULL,
    aim_difficulty                          float           NOT NULL,
    flashlight_difficulty                   float           NOT NULL,
    speed_note_count                        float           NOT NULL,
    slider_factor                           float           NOT NULL,
    clock_rate                              float           NOT NULL,
    approach_rate                           float           NOT NULL,
    overall_difficulty                      float           NOT NULL,
    hit_circle_count                        int             NOT NULL,
    slider_count                            int             NOT NULL,
    spinner_count                           int             NOT NULL,
    aim_difficult_strain_count              float           NOT NULL,
    tap_difficult_strain_count              float           NOT NULL,
    flashlight_difficult_strain_count       float           NOT NULL,
    visual_difficult_strain_count           float           NOT NULL,
    flashlight_slider_factor                float           NOT NULL,
    visual_slider_factor                    float           NOT NULL,
    possible_three_fingered_sections        text            NOT NULL,
    difficult_sliders                       text            NOT NULL,
    average_speed_delta_time                float           NOT NULL,
    vibro_factor                            float           NOT NULL,

    PRIMARY KEY (beatmap_id, mods, speed_multiplier, force_cs, force_ar, force_od, old_statistics),
    CONSTRAINT fk_live_droid_difficulty_attributes_beatmap_id FOREIGN KEY (beatmap_id) REFERENCES beatmap_hash(id)
);

CREATE INDEX IF NOT EXISTS live_droid_difficulty_attributes_main_idx ON live_droid_difficulty_attributes(beatmap_id, mods, speed_multiplier, force_cs, force_ar, force_od, old_statistics);
CREATE INDEX IF NOT EXISTS live_droid_difficulty_attributes_beatmap_idx ON live_droid_difficulty_attributes(beatmap_id);

CREATE TABLE IF NOT EXISTS rebalance_droid_difficulty_attributes (
    beatmap_id                              int             NOT NULL,
    mods                                    text            NOT NULL,
    speed_multiplier                        real            NOT NULL,
    force_cs                                real            NOT NULL,
    force_ar                                real            NOT NULL,
    force_od                                real            NOT NULL,
    old_statistics                          boolean         NOT NULL,
    tap_difficulty                          float           NOT NULL,
    rhythm_difficulty                       float           NOT NULL,
    visual_difficulty                       float           NOT NULL,
    aim_note_count                          float           NOT NULL,
    star_rating                             float           NOT NULL,
    max_combo                               int             NOT NULL,
    aim_difficulty                          float           NOT NULL,
    flashlight_difficulty                   float           NOT NULL,
    speed_note_count                        float           NOT NULL,
    slider_factor                           float           NOT NULL,
    clock_rate                              float           NOT NULL,
    approach_rate                           float           NOT NULL,
    overall_difficulty                      float           NOT NULL,
    hit_circle_count                        int             NOT NULL,
    slider_count                            int             NOT NULL,
    spinner_count                           int             NOT NULL,
    aim_difficult_strain_count              float           NOT NULL,
    tap_difficult_strain_count              float           NOT NULL,
    flashlight_difficult_strain_count       float           NOT NULL,
    visual_difficult_strain_count           float           NOT NULL,
    flashlight_slider_factor                float           NOT NULL,
    visual_slider_factor                    float           NOT NULL,
    possible_three_fingered_sections        text            NOT NULL,
    difficult_sliders                       text            NOT NULL,
    average_speed_delta_time                float           NOT NULL,
    vibro_factor                            float           NOT NULL,

    PRIMARY KEY (beatmap_id, mods, speed_multiplier, force_cs, force_ar, force_od, old_statistics),
    CONSTRAINT fk_rebalance_droid_difficulty_attributes_beatmap_id FOREIGN KEY (beatmap_id) REFERENCES beatmap_hash(id)
);

CREATE INDEX IF NOT EXISTS rebalance_droid_difficulty_attributes_main_idx ON rebalance_droid_difficulty_attributes(beatmap_id, mods, speed_multiplier, force_cs, force_ar, force_od, old_statistics);
CREATE INDEX IF NOT EXISTS rebalance_droid_difficulty_attributes_beatmap_idx ON rebalance_droid_difficulty_attributes(beatmap_id);

CREATE TABLE IF NOT EXISTS live_osu_difficulty_attributes (
    beatmap_id                              int             NOT NULL,
    mods                                    text            NOT NULL,
    speed_multiplier                        real            NOT NULL,
    force_cs                                real            NOT NULL,
    force_ar                                real            NOT NULL,
    force_od                                real            NOT NULL,
    old_statistics                          boolean         NOT NULL,
    star_rating                             float           NOT NULL,
    max_combo                               int             NOT NULL,
    aim_difficulty                          float           NOT NULL,
    speed_difficulty                        float           NOT NULL,
    flashlight_difficulty                   float           NOT NULL,
    speed_note_count                        float           NOT NULL,
    slider_factor                           float           NOT NULL,
    clock_rate                              float           NOT NULL,
    approach_rate                           float           NOT NULL,
    overall_difficulty                      float           NOT NULL,
    hit_circle_count                        int             NOT NULL,
    slider_count                            int             NOT NULL,
    spinner_count                           int             NOT NULL,

    PRIMARY KEY (beatmap_id, mods, speed_multiplier, force_cs, force_ar, force_od, old_statistics),
    CONSTRAINT fk_live_osu_difficulty_attributes_beatmap_id FOREIGN KEY (beatmap_id) REFERENCES beatmap_hash(id)
);

CREATE INDEX IF NOT EXISTS live_osu_difficulty_attributes_main_idx ON live_osu_difficulty_attributes(beatmap_id, mods, speed_multiplier, force_cs, force_ar, force_od, old_statistics);
CREATE INDEX IF NOT EXISTS live_osu_difficulty_attributes_beatmap_idx ON live_osu_difficulty_attributes(beatmap_id);

CREATE TABLE IF NOT EXISTS rebalance_osu_difficulty_attributes (
    beatmap_id                              int             NOT NULL,
    mods                                    text            NOT NULL,
    speed_multiplier                        real            NOT NULL,
    force_cs                                real            NOT NULL,
    force_ar                                real            NOT NULL,
    force_od                                real            NOT NULL,
    old_statistics                          boolean         NOT NULL,
    star_rating                             float           NOT NULL,
    max_combo                               int             NOT NULL,
    aim_difficulty                          float           NOT NULL,
    speed_difficulty                        float           NOT NULL,
    flashlight_difficulty                   float           NOT NULL,
    speed_note_count                        float           NOT NULL,
    slider_factor                           float           NOT NULL,
    clock_rate                              float           NOT NULL,
    approach_rate                           float           NOT NULL,
    overall_difficulty                      float           NOT NULL,
    hit_circle_count                        int             NOT NULL,
    slider_count                            int             NOT NULL,
    spinner_count                           int             NOT NULL,

    PRIMARY KEY (beatmap_id, mods, speed_multiplier, force_cs, force_ar, force_od, old_statistics),
    CONSTRAINT fk_rebalance_osu_difficulty_attributes_beatmap_id FOREIGN KEY (beatmap_id) REFERENCES beatmap_hash(id)
);

CREATE INDEX IF NOT EXISTS rebalance_osu_difficulty_attributes_main_idx ON rebalance_osu_difficulty_attributes(beatmap_id, mods, speed_multiplier, force_cs, force_ar, force_od, old_statistics);
CREATE INDEX IF NOT EXISTS rebalance_osu_difficulty_attributes_beatmap_idx ON rebalance_osu_difficulty_attributes(beatmap_id);