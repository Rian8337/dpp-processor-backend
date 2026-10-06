import type {
    BeatmapMetadata,
    IBeatmapServiceClient,
} from "@/clients/IBeatmapServiceClient";
import { BeatmapService } from "@/services/BeatmapService";
import { NotFoundError, ServiceUnavailableError } from "@/types/errors";
import { md5Of, readBeatmapFixture } from "@test/utils/fixtures";
import { beforeEach, describe, expect, it, vi } from "vitest";

const osuFile = readBeatmapFixture("discoprince");
const fileBytes = Buffer.from(osuFile);
const metadata: BeatmapMetadata = { id: 3, hash: md5Of(fileBytes) };

describe("BeatmapService", () => {
    let getBeatmap: ReturnType<
        typeof vi.fn<IBeatmapServiceClient["getBeatmap"]>
    >;
    let getBeatmapFile: ReturnType<
        typeof vi.fn<IBeatmapServiceClient["getBeatmapFile"]>
    >;
    let service: BeatmapService;

    beforeEach(() => {
        getBeatmap = vi.fn<IBeatmapServiceClient["getBeatmap"]>(() =>
            Promise.resolve(metadata),
        );
        getBeatmapFile = vi.fn<IBeatmapServiceClient["getBeatmapFile"]>(() =>
            Promise.resolve(fileBytes),
        );
        service = new BeatmapService({ getBeatmap, getBeatmapFile });
    });

    it("resolves uploaded files locally without caching them", async () => {
        const beatmap = await service.resolve({ file: osuFile });

        expect(beatmap.hash).toBe(md5Of(osuFile));
        expect(beatmap.cacheable).toBe(false);
        expect(await beatmap.getFile()).toBe(osuFile);
        expect(getBeatmap).not.toHaveBeenCalled();
    });

    it("resolves by ID and fetches the file lazily", async () => {
        const beatmap = await service.resolve({ id: 3 });

        expect(beatmap).toMatchObject({ hash: metadata.hash, cacheable: true });
        expect(getBeatmapFile).not.toHaveBeenCalled();
        expect(await beatmap.getFile()).toBe(osuFile);
    });

    it("caches metadata under both ID and hash, and caches files", async () => {
        await (await service.resolve({ id: 3 })).getFile();
        await (await service.resolve({ hash: metadata.hash })).getFile();

        expect(getBeatmap).toHaveBeenCalledTimes(1);
        expect(getBeatmapFile).toHaveBeenCalledTimes(1);
    });

    it("throws BEATMAP_NOT_FOUND when the beatmap or its file is missing", async () => {
        getBeatmap.mockResolvedValueOnce(null);
        await expect(service.resolve({ id: 9 })).rejects.toBeInstanceOf(
            NotFoundError,
        );

        getBeatmapFile.mockResolvedValueOnce(null);
        await expect(
            (await service.resolve({ id: 3 })).getFile(),
        ).rejects.toBeInstanceOf(NotFoundError);
    });

    it("refuses a file whose hash differs from the metadata, and forgets the stale metadata", async () => {
        getBeatmapFile.mockResolvedValueOnce(
            Buffer.from(readBeatmapFixture("loveLetter")),
        );

        const beatmap = await service.resolve({ id: 3 });

        await expect(beatmap.getFile()).rejects.toBeInstanceOf(
            ServiceUnavailableError,
        );

        await service.resolve({ id: 3 });
        expect(getBeatmap).toHaveBeenCalledTimes(2);
    });

    it("hashes file bytes, so a byte order mark does not cause a false mismatch", async () => {
        const withBom = Buffer.concat([
            Buffer.from([0xef, 0xbb, 0xbf]),
            fileBytes,
        ]);

        getBeatmap.mockResolvedValueOnce({ id: 3, hash: md5Of(withBom) });
        getBeatmapFile.mockResolvedValueOnce(withBom);

        const file = await (await service.resolve({ id: 3 })).getFile();

        expect(file.endsWith(osuFile)).toBe(true);
    });
});
