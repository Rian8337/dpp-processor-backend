import { expectPositionals, parseArguments } from "@/cli/arguments";
import { formatTable } from "@/cli/table";
import type { Command } from "@/cli/types";
import type { Variant } from "@/registry/types";
import { probeInstance, type Probe } from "@/services/probe";
import type { InfoResponse } from "@dpp/shared";

function describeProbe(probe: Probe): string {
    switch (probe.state) {
        case "healthy":
            return "healthy";
        case "mismatch":
            return `mismatch (reports "${probe.info.id}")`;
        case "down":
            return `down (${probe.reason})`;
    }
}

function row(
    variant: Variant,
    url: string,
    state: string,
    info?: InfoResponse,
): string[] {
    return [
        variant.name,
        variant.aliases.join(", ") || "-",
        variant.public ? "public" : "private",
        url,
        state,
        info?.mode ?? "-",
        info?.algorithm ?? "-",
        info?.calculatorVersion ?? "-",
    ];
}

/**
 * Checks every instance's `GET /info` directly (not through the running broker) and prints one row per instance.
 */
export const showStatus: Command = (args) => {
    const { positionals } = parseArguments(args, {});

    expectPositionals(positionals, []);

    return async ({ repository, processors, healthCheckTimeoutMs, out }) => {
        const variants = [
            ...(await repository.loadSnapshot()).variants.values(),
        ];

        if (variants.length === 0) {
            out.info("No variants.");

            return;
        }

        const rows = await Promise.all(
            variants.flatMap((variant) =>
                variant.instances.length === 0
                    ? [Promise.resolve(row(variant, "-", "no instances"))]
                    : variant.instances.map(async (instance) => {
                          const probe = await probeInstance(
                              processors,
                              instance,
                              healthCheckTimeoutMs,
                          );

                          return row(
                              variant,
                              instance.url,
                              describeProbe(probe),
                              probe.state === "down" ? undefined : probe.info,
                          );
                      }),
            ),
        );

        for (const line of formatTable(
            [
                "VARIANT",
                "ALIASES",
                "ACCESS",
                "INSTANCE",
                "STATE",
                "MODE",
                "ALGORITHM",
                "CALCULATOR",
            ],
            rows,
        )) {
            out.info(line);
        }
    };
};
