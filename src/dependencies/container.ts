import { container } from "tsyringe";

let currentContainer = container;

/**
 * Obtains the current dependency injection container.
 */
export function getContainer() {
    return currentContainer;
}

/**
 * Sets a new dependency injection container.
 *
 * @param newContainer The new container to set.
 */
export function setContainer(newContainer: typeof container) {
    currentContainer = newContainer;
}
