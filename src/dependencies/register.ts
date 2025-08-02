import { InjectionToken } from "tsyringe";
import { constructor } from "tsyringe/dist/typings/types";
// Ensure classes are loaded and metadata is registered
import "../api";
import "../repositories";
import "../services";
import { getContainer } from "./container";

/**
 * Registers all dependencies to a dependency injection container.
 *
 * @param container The dependency injection container to register dependencies to.
 * If not provided, the container from {@link getContainer} will be used.
 */
export function registerDependencies(container = getContainer()) {
    // TODO: register databases

    const classes = [
        getClasses("apiProviders"),
        getClasses("repositories"),
        getClasses("services"),
    ].flat();

    for (const cls of classes) {
        const token = Reflect.getMetadata("registrationToken", cls) as
            | InjectionToken<typeof cls>
            | undefined;

        if (!token) {
            throw new Error(
                `Class ${cls.name} is missing a registration token. Ensure it is decorated with a decorator that provides a registration token.`,
            );
        }

        container.register(token, { useClass: cls });
    }
}

function getClasses(metadataKey: string): constructor<unknown>[] {
    return (
        (Reflect.getMetadata(metadataKey, globalThis) as
            | constructor<unknown>[]
            | undefined) ?? []
    );
}
