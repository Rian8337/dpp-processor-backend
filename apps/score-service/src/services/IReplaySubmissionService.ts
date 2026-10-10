export type SubmissionResult =
    | { readonly action: "delete"; readonly reason: string }
    | {
          readonly action: "keep";
          readonly reason: string;
          readonly retryAfterMs?: number;
      };

export interface IReplaySubmissionService {
    /** Never throws: temporary failures are `keep`. */
    process(fileName: string, file: Buffer): Promise<SubmissionResult>;
}
