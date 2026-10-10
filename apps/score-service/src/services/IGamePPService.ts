import type { CalculateScoreFields, GamePPResponse } from "@dpp/shared";

export interface IGamePPService {
    /** Never throws: any failure gives `{ pp: null, pp_multiplier: null }` and a log line. */
    calculateScore(fields: CalculateScoreFields): Promise<GamePPResponse>;

    calculateReplay(replay: Buffer, variant?: string): Promise<GamePPResponse>;
}
