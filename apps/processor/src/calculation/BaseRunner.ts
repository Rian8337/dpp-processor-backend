import type { ReplayAnalysis, ReplayHeader } from "@/algorithms/types";
import type {
    CacheableDifficultyAttributes,
    IDifficultyAttributes,
} from "@rian8337/osu-difficulty-calculator";
import type { ICalculationRunner } from "./ICalculationRunner";
import { unwrapOutcome } from "./outcome";
import type { CalculationTask, TaskOutcome } from "./tasks";

/**
 * Implements the runner methods on top of a task dispatcher.
 */
export abstract class BaseRunner implements ICalculationRunner {
    protected abstract dispatch(task: CalculationTask): Promise<TaskOutcome>;

    abstract [Symbol.asyncDispose](): Promise<void>;

    async calculateDifficulty(
        input: Parameters<ICalculationRunner["calculateDifficulty"]>[0],
    ) {
        return unwrapOutcome<
            CacheableDifficultyAttributes<IDifficultyAttributes>
        >(await this.dispatch({ kind: "difficulty", ...input }));
    }

    async readReplay(replay: Buffer) {
        return unwrapOutcome<ReplayHeader>(
            await this.dispatch({ kind: "readReplay", replay }),
        );
    }

    async analyzeReplay(
        input: Parameters<ICalculationRunner["analyzeReplay"]>[0],
    ) {
        return unwrapOutcome<ReplayAnalysis>(
            await this.dispatch({ kind: "analyzeReplay", ...input }),
        );
    }

    async renderStrainChart(
        input: Parameters<ICalculationRunner["renderStrainChart"]>[0],
    ) {
        // Buffers arrive from workers as plain Uint8Arrays.
        return Buffer.from(
            unwrapOutcome<Uint8Array>(
                await this.dispatch({ kind: "strainChart", ...input }),
            ),
        );
    }
}
