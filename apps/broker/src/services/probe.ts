import type { IProcessorClient } from "@/clients/IProcessorClient";
import type { Instance } from "@/registry/types";
import type { InfoResponse } from "@dpp/shared";

/**
 * The result of one `GET /info` check of an instance.
 */
export type Probe =
    | { readonly state: "healthy"; readonly info: InfoResponse }
    | { readonly state: "mismatch"; readonly info: InfoResponse }
    | { readonly state: "down"; readonly reason: string };

export type InstanceState = Probe["state"];

/**
 * Checks an instance: healthy if its `/info` names the instance's variant, mismatch if it names another, down if
 * the call failed.
 */
export async function probeInstance(
    client: Pick<IProcessorClient, "getInfo">,
    instance: Instance,
    timeoutMs: number,
): Promise<Probe> {
    const result = await client.getInfo(instance.url, timeoutMs);

    if (result.kind === "failed") {
        return { state: "down", reason: result.reason };
    }

    return result.info.id === instance.variantName
        ? { state: "healthy", info: result.info }
        : { state: "mismatch", info: result.info };
}
