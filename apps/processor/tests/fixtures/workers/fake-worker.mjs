// A stand-in for the real worker, used to test PiscinaRunner without bundling TypeScript.
export default async function handle(task) {
    if (task.kind === "readReplay" && task.replay.length === 0) {
        throw new Error("worker crashed");
    }

    if (task.kind === "strainChart") {
        await new Promise((resolve) => setTimeout(resolve, 300));

        return { ok: true, value: new Uint8Array([1, 2, 3]) };
    }

    if (task.kind === "analyzeReplay") {
        return { ok: false, code: "INVALID_REPLAY", message: "bad replay" };
    }

    return { ok: true, value: { kind: task.kind } };
}
