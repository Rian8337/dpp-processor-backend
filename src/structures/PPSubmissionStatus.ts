/**
 * Status of pp submission operation.
 */
export interface PPSubmissionStatus {
    /**
     * Whether the operation was successful.
     */
    success: boolean;

    /**
     * Whether the replay file needs to be persisted.
     */
    replayNeedsPersistence?: boolean;
}
