import { Modes } from "@rian8337/osu-base";
import { DroidAlgorithm } from "./DroidAlgorithm";
import { OsuAlgorithm } from "./OsuAlgorithm";
import type { Algorithm } from "./types";

/**
 * Creates the algorithm for a game mode.
 */
export function createAlgorithm(mode: Modes): Algorithm {
    switch (mode) {
        case Modes.Droid:
            return new DroidAlgorithm();

        case Modes.Osu:
            return new OsuAlgorithm();
    }
}
