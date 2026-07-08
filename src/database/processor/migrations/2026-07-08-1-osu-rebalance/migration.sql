ALTER TABLE live_osu_difficulty_attributes
    ADD COLUMN reading_difficulty FLOAT NOT NULL,
    ADD COLUMN reading_difficult_note_count FLOAT NOT NULL;