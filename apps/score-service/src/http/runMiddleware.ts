import type { Request, RequestHandler, Response } from "express";

/**
 * Runs Express middleware inside a handler, so its errors can be answered the handler's way.
 */
export function runMiddleware(
    req: Request,
    res: Response,
    middleware: RequestHandler,
): Promise<void> {
    return new Promise((resolve, reject) => {
        void middleware(req, res, (error?: unknown) => {
            if (error) {
                reject(
                    error instanceof Error
                        ? error
                        : new Error("Middleware failed"),
                );
            } else {
                resolve();
            }
        });
    });
}
