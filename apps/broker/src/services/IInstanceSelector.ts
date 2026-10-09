import type { Instance, Variant } from "@/registry/types";

export interface IInstanceSelector {
    /** Round-robin over the variant's healthy instances, skipping every instance in `exclude`. */
    select(variant: Variant, ...exclude: Instance[]): Instance | undefined;
}
