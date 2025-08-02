import { injectable, InjectionToken } from "tsyringe";
import { constructor } from "tsyringe/dist/typings/types";

/**
 * Marks a class as a service that can be injected into other classes.
 *
 * @param token The injection token for the service.
 * @returns A class decorator that marks the class as a service.
 */
export function Service(token: InjectionToken): ClassDecorator {
    return (target) => {
        const targetConstructor = target as unknown as constructor<unknown>;

        Reflect.defineMetadata("registrationToken", token, target);

        const services =
            (Reflect.getMetadata("services", globalThis) as
                | constructor<unknown>[]
                | undefined) ?? [];

        Reflect.defineMetadata(
            "services",
            services.concat(targetConstructor),
            globalThis,
        );

        injectable()(targetConstructor);
    };
}
