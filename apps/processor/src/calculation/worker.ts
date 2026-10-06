import { createAlgorithm } from "@/algorithms/createAlgorithm";
import { Modes } from "@rian8337/osu-base";
import { workerData } from "node:worker_threads";
import { z } from "zod";
import { CalculationTaskHandler, type CalculationTask } from "./tasks";

const { mode } = z.object({ mode: z.enum(Modes) }).parse(workerData);
const handler = new CalculationTaskHandler(createAlgorithm(mode));

/**
 * The piscina worker entry: runs one calculation task.
 */
export default function runTask(task: CalculationTask) {
    return handler.handle(task);
}
