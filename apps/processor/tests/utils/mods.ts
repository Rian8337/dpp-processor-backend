import { ModMap, type Mod } from "@rian8337/osu-base";

/**
 * Builds a `ModMap` from mod instances, e.g. `modMap(new ModHidden(), new ModDoubleTime())`.
 */
export function modMap(...mods: Mod[]): ModMap {
    const map = new ModMap();

    for (const mod of mods) {
        map.set(mod);
    }

    return map;
}
