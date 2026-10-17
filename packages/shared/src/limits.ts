/**
 * The largest request body the processor and the broker accept: 1 MiB, enough for a base64 replay.
 */
export const maxRequestBodyBytes = 1024 * 1024;

/**
 * The longest variant title, in characters.
 */
export const maxVariantTitleLength = 100;

/**
 * The longest variant description, in characters. Newlines are allowed.
 */
export const maxVariantDescriptionLength = 4000;
