import { HttpStatusCode } from "./http";

/**
 * Represents an optional type with a fallback to a certain type.
 */
export type Optional<
    TPresent extends boolean,
    TData,
    TFallback = undefined,
> = TPresent extends true ? TData : TData | TFallback;

/**
 * Represents the result of an operation within a {@link Service}.
 *
 * @template T The type of the data.
 */
export interface OperationResult<T = unknown> {
    /**
     * The HTTP status code of the operation.
     */
    readonly status: HttpStatusCode;

    /**
     * Whether the operation was successful.
     */
    isSuccessful(): this is SuccessfulOperationResult<T>;

    /**
     * Whether the operation failed.
     */
    failed(): this is FailedOperationResult;
}

/**
 * Represents a successful operation result.
 *
 * @template T The type of the data.
 */
export interface SuccessfulOperationResult<T> extends OperationResult<T> {
    /**
     * The data of the operation.
     */
    readonly data: T;
}

/**
 * Represents a failed operation result.
 */
export interface FailedOperationResult extends OperationResult<never> {
    /**
     * The error message of the operation.
     */
    readonly error: string;
}

/**
 * An {@link OperationResult} that can either be successful or failed.
 *
 * @template T The type of the data.
 */
export type EitherOperationResult<T = unknown> =
    | SuccessfulOperationResult<T>
    | FailedOperationResult;
