const namePattern = /^[a-z0-9][a-z0-9-]*$/;

/**
 * Whether a variant, alias, or key name is allowed: lowercase letters, digits, and hyphens, not starting with a
 * hyphen.
 */
export function isValidName(name: string): boolean {
    return namePattern.test(name);
}

/**
 * The message for a name that {@link isValidName} refuses.
 */
export function invalidNameMessage(name: string): string {
    return `Invalid name "${name}": use lowercase letters, digits, and hyphens, not starting with a hyphen`;
}
