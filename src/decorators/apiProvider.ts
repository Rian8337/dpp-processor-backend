import { InjectionToken } from "tsyringe";
import { constructor } from "tsyringe/dist/typings/types";

/**
 * Marks a class as an API provider that can be injected into other classes.
 *
 * @param token The injection token for the API provider.
 * @returns A class decorator that marks the class as an API provider.
 */
export function APIProvider(token: InjectionToken): ClassDecorator {
    return (target) => {
        const targetConstructor = target as unknown as constructor<unknown>;

        Reflect.defineMetadata("registrationToken", token, target);

        const apiProviders =
            (Reflect.getMetadata("apiProviders", globalThis) as
                | constructor<unknown>[]
                | undefined) ?? [];

        Reflect.defineMetadata(
            "apiProviders",
            apiProviders.concat(targetConstructor),
            globalThis,
        );
    };
}
