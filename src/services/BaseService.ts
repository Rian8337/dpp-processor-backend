import {
    FailedOperationResult,
    HttpStatusCode,
    SuccessfulOperationResult,
} from "@/types";

/**
 * The base class for all services.
 */
export abstract class BaseService {
    /**
     * Creates a successful operation result.
     *
     * @param data The data of the operation.
     * @param status The HTTP status code of the operation. Defaults to {@link HttpStatusCode.Ok}.
     * @returns The successful operation result.
     * @template T The type of the data.
     */
    protected createSuccessfulResponse<T>(
        data: T,
        status = HttpStatusCode.Ok,
    ): SuccessfulOperationResult<T> {
        return {
            status,
            data,
            isSuccessful: (): this is SuccessfulOperationResult<T> => true,
            failed: (): this is FailedOperationResult => false,
        };
    }

    /**
     * Creates a failed operation result.
     *
     * @param status The HTTP status code of the operation.
     * @param error The error message of the operation. Defaults to {@link HttpStatusCode.BadRequest}.
     * @returns The failed operation result.
     */
    protected createFailedResponse(
        error: string,
        status = HttpStatusCode.BadRequest,
    ): FailedOperationResult {
        return {
            status,
            error,
            isSuccessful: (): this is SuccessfulOperationResult<never> => false,
            failed: (): this is FailedOperationResult => true,
        };
    }
}
