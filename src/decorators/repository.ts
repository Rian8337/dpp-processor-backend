import { injectable, InjectionToken } from "tsyringe";
import { constructor } from "tsyringe/dist/typings/types";

/**
 * Marks a class as a repository that can be injected into other classes.
 *
 * @param token The injection token for the repository.
 * @returns A class decorator that marks the class as a repository.
 */
export function Repository(token: InjectionToken): ClassDecorator {
    return (target) => {
        const targetConstructor = target as unknown as constructor<unknown>;

        Reflect.defineMetadata("registrationToken", token, target);

        const repositories =
            (Reflect.getMetadata("repositories", globalThis) as
                | constructor<unknown>[]
                | undefined) ?? [];

        Reflect.defineMetadata(
            "repositories",
            repositories.concat(targetConstructor),
            globalThis,
        );

        injectable()(targetConstructor);
    };
}
