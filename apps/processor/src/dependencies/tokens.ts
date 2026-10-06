import type { InjectionToken } from "tsyringe";

/**
 * Tokens for dependency injection. Each token is added by the task that introduces its interface.
 */
export const dependencyTokens = {} satisfies Record<
    string,
    InjectionToken<unknown>
>;
