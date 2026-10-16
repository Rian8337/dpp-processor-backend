import type { CalculateScoreFields, GamePPResponse } from "@dpp/shared";

/**
 * - `ok`: the calculation, to send as is.
 * - `failed`: a permanent failure (invalid input, an unsupported replay, a definite answer from upstream). The game
 *   should store the score without pp.
 * - `retry`: a temporary failure (upstream busy or unreachable, or this service misconfigured). The game should
 *   record the score as uncalculated, which the uncalculated pass picks up later.
 */
export type GamePPResult =
    | { readonly kind: "ok"; readonly response: GamePPResponse }
    | { readonly kind: "failed" }
    | { readonly kind: "retry" };

export interface IGamePPService {
    /** Never throws: every failure is a `failed` or `retry` result and a log line. */
    calculateScore(fields: CalculateScoreFields): Promise<GamePPResult>;

    calculateReplay(replay: Buffer, variant?: string): Promise<GamePPResult>;
}
