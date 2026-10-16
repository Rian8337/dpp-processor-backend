import type {
    DifficultyRequest,
    DifficultyResponse,
    PerformanceRequest,
    PerformanceResponse,
    ReplayPerformanceRequest,
    ReplayPerformanceResponse,
} from "@dpp/shared";

/**
 * Orchestrates calculation requests. Requests must already be validated.
 */
export interface ICalculationService {
    calculateDifficulty(
        request: DifficultyRequest,
    ): Promise<DifficultyResponse>;
    calculatePerformance(
        request: PerformanceRequest,
    ): Promise<PerformanceResponse>;
    calculateReplayPerformance(
        request: ReplayPerformanceRequest,
    ): Promise<ReplayPerformanceResponse>;
}
