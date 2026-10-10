import type {
    BeatmapInfo,
    BeatmapLane,
    IBeatmapServiceClient,
} from "@/clients/IBeatmapServiceClient";
import type { UpstreamResult } from "@/types/upstream";
import { RankedStatus } from "@rian8337/osu-base";

export class FakeBeatmapServiceClient implements IBeatmapServiceClient {
    readonly calls: { lane: BeatmapLane; hash: string }[] = [];

    constructor(
        public answer: (hash: string) => UpstreamResult<BeatmapInfo | null> = (
            hash,
        ) => ({
            ok: true,
            value: {
                hash,
                title: "Artist - Title (Mapper) [Hard]",
                rankedStatus: RankedStatus.Ranked,
            },
        }),
    ) {}

    getBeatmap(lane: BeatmapLane, hash: string) {
        this.calls.push({ lane, hash });

        return Promise.resolve(this.answer(hash));
    }
}
