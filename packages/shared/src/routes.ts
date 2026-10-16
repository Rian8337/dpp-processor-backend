/**
 * The processor's calculation routes, which the broker forwards. `GET /info` is not one of them.
 */
export const processorRoutes = [
    "/difficulty",
    "/performance",
    "/performance/replay",
] as const;

export type ProcessorRoute = (typeof processorRoutes)[number];

/**
 * Whether a path is exactly one of the processor's calculation routes.
 */
export function isProcessorRoute(path: string): path is ProcessorRoute {
    return processorRoutes.some((route) => route === path);
}
