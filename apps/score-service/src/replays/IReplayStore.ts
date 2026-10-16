export type ReplayFolder = "unprocessed" | "online" | "best" | "uncalculated";

export interface IReplayStore {
    /** The file's contents, or null if it does not exist. Other read errors throw. */
    read(folder: ReplayFolder, fileName: string): Promise<Buffer | null>;

    /** `<scoreId>.odr` in the online or best folder. */
    readScoreReplay(
        folder: "online" | "best",
        scoreId: number,
    ): Promise<Buffer | null>;

    /** Writes `<scoreId>.odr` to the best folder, readable by everyone (as the old code did). */
    writeBestReplay(scoreId: number, replay: Buffer): Promise<void>;

    /** Deletes `<scoreId>.odr` from the best folder; a missing file is not an error. */
    deleteBestReplay(scoreId: number): Promise<void>;

    /** File names in a folder (not directories). A missing folder throws. */
    list(folder: ReplayFolder): Promise<string[]>;

    /** When the file was last modified, or null if it does not exist. Other errors throw. */
    modifiedAt(folder: ReplayFolder, fileName: string): Promise<Date | null>;

    /** Deletes a file; a missing file is not an error. */
    delete(folder: ReplayFolder, fileName: string): Promise<void>;
}
