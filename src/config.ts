import { url } from "inspector";

/**
 * Whether the application is running in debug mode.
 */
export const isDebug = !!url();
