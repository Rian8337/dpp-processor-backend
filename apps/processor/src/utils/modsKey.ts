import type { SerializedMod } from "@rian8337/osu-base";

function sortKeys(value: unknown): unknown {
    if (Array.isArray(value)) {
        return value.map(sortKeys);
    }

    if (value !== null && typeof value === "object") {
        return Object.fromEntries(
            Object.entries(value)
                .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
                .map(([key, nested]) => [key, sortKeys(nested)]),
        );
    }

    return value;
}

/**
 * Builds the canonical cache key for a set of mods: sorted by acronym, settings with sorted keys, empty settings
 * omitted, serialized as JSON.
 *
 * Callers should pass only difficulty-adjusting mods.
 */
export function createModsKey(mods: Iterable<SerializedMod>): string {
    const canonical = [...mods]
        .map((mod) =>
            mod.settings && Object.keys(mod.settings).length > 0
                ? { acronym: mod.acronym, settings: sortKeys(mod.settings) }
                : { acronym: mod.acronym },
        )
        .sort((a, b) =>
            a.acronym < b.acronym ? -1 : a.acronym > b.acronym ? 1 : 0,
        );

    return JSON.stringify(canonical);
}
