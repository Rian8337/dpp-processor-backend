import type { CliOutput } from "./types";

export const consoleOutput: CliOutput = {
    info: (line) => console.log(line),
    error: (line) => console.error(line),
};

export const reloadReminder =
    "The running broker applies changes within REGISTRY_RELOAD_INTERVAL_SECONDS (default 30 s), or immediately after `pm2 sendSignal SIGHUP <broker app>`.";
