export interface ITotalPPService {
    /**
     * Recomputes a player's total pp and accuracy from their best scores.
     */
    recalculate(uid: number, now?: Date): Promise<void>;
}
