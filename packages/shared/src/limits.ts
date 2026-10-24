/**
 * The largest replay file the score service accepts from the game: 2 MiB.
 */
export const maxReplayBytes = 2 * 1024 * 1024;

/**
 * The largest request body the processor and the broker accept: 4 MiB, enough for the largest replay as base64.
 */
export const maxRequestBodyBytes = 4 * 1024 * 1024;

/**
 * The longest variant title, in characters.
 */
export const maxVariantTitleLength = 100;

/**
 * The longest variant description, in characters. Newlines are allowed.
 */
export const maxVariantDescriptionLength = 4000;
