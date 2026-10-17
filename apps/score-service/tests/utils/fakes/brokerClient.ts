import type {
    IBrokerClient,
    PerformanceRequestInput,
    ReplayPerformanceRequestInput,
} from "@/clients/IBrokerClient";
import type { PerformanceBody, ReplayPerformanceBody } from "@/clients/schemas";
import type { UpstreamResult } from "@/types/upstream";
import { Modes } from "@rian8337/osu-base";

export type BrokerCall =
    | {
          kind: "performance";
          variant: string;
          request: PerformanceRequestInput;
          actingUid?: number;
      }
    | {
          kind: "replay";
          variant: string;
          request: ReplayPerformanceRequestInput;
          actingUid?: number;
      };

/**
 * A broker that answers with scripted handlers and records every call.
 */
export class FakeBrokerClient implements IBrokerClient {
    readonly calls: BrokerCall[] = [];
    readonly modeCalls: { variant: string; actingUid?: number }[] = [];
    modes = new Map<string, Modes>([
        ["live-droid", Modes.Droid],
        ["live-osu", Modes.Osu],
    ]);

    constructor(
        public onPerformance: (
            variant: string,
            request: PerformanceRequestInput,
        ) => UpstreamResult<PerformanceBody> = () => {
            throw new Error("Unexpected performance call");
        },
        public onReplay: (
            variant: string,
            request: ReplayPerformanceRequestInput,
        ) => UpstreamResult<ReplayPerformanceBody> = () => {
            throw new Error("Unexpected replay call");
        },
    ) {}

    performance(
        variant: string,
        request: PerformanceRequestInput,
        actingUid?: number,
    ) {
        this.calls.push({
            kind: "performance",
            variant,
            request,
            ...(actingUid !== undefined && { actingUid }),
        });
        return Promise.resolve(this.onPerformance(variant, request));
    }

    replayPerformance(
        variant: string,
        request: ReplayPerformanceRequestInput,
        actingUid?: number,
    ) {
        this.calls.push({
            kind: "replay",
            variant,
            request,
            ...(actingUid !== undefined && { actingUid }),
        });
        return Promise.resolve(this.onReplay(variant, request));
    }

    variantMode(
        variant: string,
        actingUid?: number,
    ): Promise<UpstreamResult<Modes>> {
        this.modeCalls.push({
            variant,
            ...(actingUid !== undefined && { actingUid }),
        });

        const mode = this.modes.get(variant);

        return Promise.resolve(
            mode
                ? { ok: true, value: mode }
                : {
                      ok: false,
                      kind: "rejected",
                      status: 404,
                      code: "VARIANT_NOT_FOUND",
                      message: `No variant ${variant}`,
                  },
        );
    }
}

export const retryLater = {
    ok: false,
    kind: "retry",
    status: 503,
    code: "VARIANT_UNAVAILABLE",
    message: "busy",
} as const;

export const beatmapNotFound = {
    ok: false,
    kind: "rejected",
    status: 404,
    code: "BEATMAP_NOT_FOUND",
    message: "No beatmap",
} as const;
