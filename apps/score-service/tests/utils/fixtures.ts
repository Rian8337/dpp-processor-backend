import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const fixtures = fileURLToPath(new URL("../fixtures/", import.meta.url));

/**
 * A replay fixture provided by the user, or null while it is missing (tests using it are skipped).
 * Expected: `replays/v3.odr` (version 3 or later, `replayVersion > 6`). `replays/v2.odr` (older than v3) is optional
 * and may never exist: the production replay storage has none, so the v1/v2 paths are tested with made-up data.
 */
export function readReplayFixture(name: "v3" | "v2"): Buffer | null {
    const path = `${fixtures}replays/${name}.odr`;

    return existsSync(path) ? readFileSync(path) : null;
}
