import type { IReplayStore, ReplayFolder } from "@/replays/IReplayStore";

/**
 * Replay folders in memory.
 */
export class InMemoryReplayStore implements IReplayStore {
    readonly files = new Map<ReplayFolder, Map<string, Buffer>>(
        (["unprocessed", "online", "best", "uncalculated"] as const).map(
            (folder) => [folder, new Map()],
        ),
    );

    /** Modification times by `folder/fileName`; a file without an entry was modified when it was put. */
    private readonly modified = new Map<string, Date>();

    put(folder: ReplayFolder, fileName: string, contents: Buffer | string) {
        this.files.get(folder)!.set(fileName, Buffer.from(contents));
        this.modified.set(`${folder}/${fileName}`, new Date());
    }

    setModifiedAt(folder: ReplayFolder, fileName: string, date: Date) {
        this.modified.set(`${folder}/${fileName}`, date);
    }

    modifiedAt(folder: ReplayFolder, fileName: string) {
        return Promise.resolve(
            this.files.get(folder)!.has(fileName)
                ? (this.modified.get(`${folder}/${fileName}`) ?? new Date())
                : null,
        );
    }

    read(folder: ReplayFolder, fileName: string) {
        return Promise.resolve(this.files.get(folder)!.get(fileName) ?? null);
    }

    readScoreReplay(folder: "online" | "best", scoreId: number) {
        return this.read(folder, `${scoreId.toString()}.odr`);
    }

    writeBestReplay(scoreId: number, replay: Buffer) {
        this.put("best", `${scoreId.toString()}.odr`, replay);
        return Promise.resolve();
    }

    deleteBestReplay(scoreId: number) {
        return this.delete("best", `${scoreId.toString()}.odr`);
    }

    list(folder: ReplayFolder) {
        return Promise.resolve([...this.files.get(folder)!.keys()]);
    }

    delete(folder: ReplayFolder, fileName: string) {
        this.files.get(folder)!.delete(fileName);
        return Promise.resolve();
    }
}
