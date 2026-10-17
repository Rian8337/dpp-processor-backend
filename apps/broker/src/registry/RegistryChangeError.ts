/**
 * A change to the registry that its rules refuse. Its message is shown to the operator or API caller as is.
 *
 * - `invalid`: the input breaks a format or length rule.
 * - `not-found`: the thing to change does not exist.
 * - `variant-not-found`: a variant named by the change does not exist.
 * - `conflict`: the change clashes with the registry's current state.
 */
export class RegistryChangeError extends Error {
    constructor(
        readonly kind:
            | "invalid"
            | "not-found"
            | "variant-not-found"
            | "conflict",
        message: string,
    ) {
        super(message);
        this.name = "RegistryChangeError";
    }
}
