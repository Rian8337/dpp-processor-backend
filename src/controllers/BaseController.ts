import { EitherOperationResult } from "@/types";
import { Response } from "express";

/**
 * Base class for controllers.
 */
export abstract class BaseController {
    /**
     * Responds to an HTTP request with an operation result.
     *
     * @param res The Express response object.
     * @param result The operation result to respond with.
     */
    protected respondWithOperationResult(
        res: Response,
        result: EitherOperationResult<object>,
    ) {
        res.status(result.status);

        if (result.isSuccessful()) {
            res.json(result.data);
        } else {
            res.json({ error: result.error });
        }
    }
}
