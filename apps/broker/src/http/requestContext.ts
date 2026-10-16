import type { Caller } from "@/registry/types";
import type { Response } from "express";

// Keyed by response object, so per-request state stays typed instead of living in `res.locals`.
const callers = new WeakMap<Response, Caller>();
const variantNames = new WeakMap<Response, string>();

export function setCaller(res: Response, caller: Caller): void {
    callers.set(res, caller);
}

/**
 * The caller of a request that passed the auth middleware.
 *
 * @throws {Error} If the auth middleware has not run for this response.
 */
export function getCaller(res: Response): Caller {
    const caller = callers.get(res);

    if (!caller) {
        throw new Error("The auth middleware has not run for this request");
    }

    return caller;
}

/**
 * The caller, or `undefined` if the request was rejected before it was authenticated.
 */
export function findCaller(res: Response): Caller | undefined {
    return callers.get(res);
}

export function setVariantName(res: Response, name: string): void {
    variantNames.set(res, name);
}

/**
 * The variant the request was routed to, if it got that far.
 */
export function findVariantName(res: Response): string | undefined {
    return variantNames.get(res);
}
