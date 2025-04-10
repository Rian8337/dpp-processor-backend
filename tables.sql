CREATE TABLE IF NOT EXISTS beatmap (
    id                       int             NOT NULL,
    hash                     varchar(32)     NOT NULL,
    title                    text            NOT NULL,
    hit_length               int             NOT NULL,
    total_length             int             NOT NULL,
    max_combo                int,
    object_count             int             NOT NULL,
    ranked_status            smallint        NOT NULL,
    last_checked             timestamp       NOT NULL,

    PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS beatmap_id_idx ON beatmap(id);
CREATE INDEX IF NOT EXISTS beatmap_hash_idx ON beatmap(hash);

CREATE TABLE IF NOT EXISTS live_droid_difficulty_attributes (
    beatmap_id                              int             NOT NULL,
    mods                                    jsonb           NOT NULL,
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
    overall_difficulty                      float           NOT NULL,
    hit_circle_count                        int             NOT NULL,
    slider_count                            int             NOT NULL,
    spinner_count                           int             NOT NULL,
    aim_difficult_slider_count              float           NOT NULL,
    aim_difficult_strain_count              float           NOT NULL,
    tap_difficult_strain_count              float           NOT NULL,
    flashlight_difficult_strain_count       float           NOT NULL,
    visual_difficult_strain_count           float           NOT NULL,
    flashlight_slider_factor                float           NOT NULL,
    visual_slider_factor                    float           NOT NULL,
    possible_three_fingered_sections        jsonb           NOT NULL,
    difficult_sliders                       jsonb           NOT NULL,
    average_speed_delta_time                float           NOT NULL,
    vibro_factor                            float           NOT NULL,

    PRIMARY KEY (beatmap_id, mods),
    CONSTRAINT fk_live_droid_difficulty_attributes_beatmap_id FOREIGN KEY (beatmap_id) REFERENCES beatmap(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS live_droid_difficulty_attributes_beatmap_idx ON live_droid_difficulty_attributes(beatmap_id);

CREATE TABLE IF NOT EXISTS rebalance_droid_difficulty_attributes (
    beatmap_id                              int             NOT NULL,
    mods                                    jsonb           NOT NULL,
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
    overall_difficulty                      float           NOT NULL,
    hit_circle_count                        int             NOT NULL,
    slider_count                            int             NOT NULL,
    spinner_count                           int             NOT NULL,
    aim_difficult_slider_count              float           NOT NULL,
    aim_difficult_strain_count              float           NOT NULL,
    tap_difficult_strain_count              float           NOT NULL,
    flashlight_difficult_strain_count       float           NOT NULL,
    visual_difficult_strain_count           float           NOT NULL,
    flashlight_slider_factor                float           NOT NULL,
    visual_slider_factor                    float           NOT NULL,
    possible_three_fingered_sections        jsonb           NOT NULL,
    difficult_sliders                       jsonb           NOT NULL,
    average_speed_delta_time                float           NOT NULL,
    vibro_factor                            float           NOT NULL,

    PRIMARY KEY (beatmap_id, mods),
    CONSTRAINT fk_rebalance_droid_difficulty_attributes_beatmap_id FOREIGN KEY (beatmap_id) REFERENCES beatmap(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS rebalance_droid_difficulty_attributes_beatmap_idx ON rebalance_droid_difficulty_attributes(beatmap_id);

CREATE TABLE IF NOT EXISTS live_osu_difficulty_attributes (
    beatmap_id                              int             NOT NULL,
    mods                                    jsonb           NOT NULL,
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
    aim_difficult_slider_count              float           NOT NULL,
    aim_difficult_strain_count              float           NOT NULL,
    speed_difficult_strain_count            float           NOT NULL,

    PRIMARY KEY (beatmap_id, mods),
    CONSTRAINT fk_live_osu_difficulty_attributes_beatmap_id FOREIGN KEY (beatmap_id) REFERENCES beatmap(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS live_osu_difficulty_attributes_beatmap_idx ON live_osu_difficulty_attributes(beatmap_id);

CREATE TABLE IF NOT EXISTS rebalance_osu_difficulty_attributes (
    beatmap_id                              int             NOT NULL,
    mods                                    jsonb           NOT NULL,
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
    aim_difficult_slider_count              float           NOT NULL,
    aim_difficult_strain_count              float           NOT NULL,
    speed_difficult_strain_count            float           NOT NULL,

    PRIMARY KEY (beatmap_id, mods),
    CONSTRAINT fk_rebalance_osu_difficulty_attributes_beatmap_id FOREIGN KEY (beatmap_id) REFERENCES beatmap(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS rebalance_osu_difficulty_attributes_beatmap_idx ON rebalance_osu_difficulty_attributes(beatmap_id);

CREATE TABLE IF NOT EXISTS score_calculation (
    process_id                  int             NOT NULL,
    score_id                    int             NOT NULL,

    PRIMARY KEY (process_id)
);

CREATE TABLE IF NOT EXISTS total_pp_calculation (
    id                    int             NOT NULL,

    PRIMARY KEY (id)
);