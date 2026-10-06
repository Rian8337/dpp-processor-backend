import { BadRequestError } from "@/types/errors";
import type { z } from "zod";

/**
 * Validates a request body.
 *
 * @throws {BadRequestError} With the first validation issue as the message.
 */
export function parseBody<T extends z.ZodType>(
    schema: T,
    body: unknown,
): z.infer<T> {
    const result = schema.safeParse(body);

    if (!result.success) {
        const issue = result.error.issues[0];
        const path = issue?.path.length ? `${issue.path.join(".")}: ` : "";

        throw new BadRequestError(
            `${path}${issue?.message ?? "Invalid request body"}`,
        );
    }

    return result.data;
}
