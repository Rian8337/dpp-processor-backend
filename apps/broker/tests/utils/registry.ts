import { buildSnapshot, type SnapshotRows } from "@/registry/snapshot";
import type { RegistrySnapshot } from "@/registry/types";
import type { InfoResponse } from "@dpp/shared";
import { Modes } from "@rian8337/osu-base";

/**
 * Builds a snapshot from the rows given; missing tables are empty.
 */
export function testSnapshot(rows: Partial<SnapshotRows>): RegistrySnapshot {
    return buildSnapshot({
        variants: [],
        instances: [],
        aliases: [],
        keys: [],
        grants: [],
        users: [],
        userGrants: [],
        ...rows,
    });
}

/**
 * A processor's `GET /info` response for variant `id`.
 */
export function testInfo(id: string): InfoResponse {
    return {
        id,
        mode: Modes.Droid,
        algorithm: "live",
        calculatorVersion: "0123456789abcdef",
        builtAt: "2026-10-07T00:00:00.000Z",
    };
}
