import { TaskQueue } from "@/runtime/TaskQueue";
import { afterEach, describe, expect, it, vi } from "vitest";

function deferred() {
    let resolve!: () => void;
    const promise = new Promise<void>((r) => (resolve = r));

    return { promise, resolve };
}

describe("TaskQueue", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("never runs more than the concurrency at once", async () => {
        await using queue = new TaskQueue(2);
        const gates = Array.from({ length: 5 }, deferred);
        let running = 0;
        let max = 0;

        gates.forEach((gate, i) => {
            queue.add(`k${i.toString()}`, async () => {
                running++;
                max = Math.max(max, running);
                await gate.promise;
                running--;
            });
        });

        await vi.waitFor(() => expect(running).toBe(2));

        for (const gate of gates) {
            gate.resolve();
            await Promise.resolve();
        }

        await queue.onIdle();
        expect(max).toBe(2);
    });

    it("ignores a key that is queued or running, then accepts it again", async () => {
        await using queue = new TaskQueue(1);
        const gate = deferred();
        const task = vi.fn(() => gate.promise);

        expect(queue.add("a", task)).toBe(true);
        expect(queue.add("a", task)).toBe(false);
        expect(queue.add("b", () => Promise.resolve())).toBe(true);
        expect(queue.add("b", () => Promise.resolve())).toBe(false);

        gate.resolve();
        await queue.onIdle();

        expect(task).toHaveBeenCalledTimes(1);
        expect(queue.add("a", () => Promise.resolve())).toBe(true);
    });

    it("logs a throwing task and continues", async () => {
        const error = vi.spyOn(console, "error").mockImplementation(() => {});
        await using queue = new TaskQueue(1);
        const second = vi.fn(() => Promise.resolve());

        queue.add("bad", () => Promise.reject(new Error("boom")));
        queue.add("good", second);
        await queue.onIdle();

        expect(error).toHaveBeenCalledOnce();
        expect(second).toHaveBeenCalledOnce();
    });

    it("resolves onIdle after all tasks, and immediately when empty", async () => {
        await using queue = new TaskQueue(1);

        await queue.onIdle();

        const gate = deferred();
        const idle = vi.fn();

        queue.add("a", () => gate.promise);
        void queue.onIdle().then(idle);
        await Promise.resolve();
        expect(idle).not.toHaveBeenCalled();
        expect(queue.size).toBe(1);

        gate.resolve();
        await queue.onIdle();
        expect(idle).toHaveBeenCalled();
        expect(queue.size).toBe(0);
    });

    it("drops queued tasks on disposal, waits for running ones, and refuses new ones", async () => {
        const queue = new TaskQueue(1);
        const gate = deferred();
        const queued = vi.fn(() => Promise.resolve());
        let finished = false;

        queue.add("running", async () => {
            await gate.promise;
            finished = true;
        });
        queue.add("queued", queued);

        const disposing = queue[Symbol.asyncDispose]();
        await Promise.resolve();
        expect(finished).toBe(false);

        gate.resolve();
        await disposing;

        expect(finished).toBe(true);
        expect(queued).not.toHaveBeenCalled();
        expect(queue.add("late", queued)).toBe(false);
    });
});
