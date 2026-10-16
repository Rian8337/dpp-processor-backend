/**
 * Environment variable keys used in the application.
 */
export enum EnvironmentVariableKey {
    Port = "PORT",
    DatabaseHost = "DATABASE_HOST",
    DatabasePort = "DATABASE_PORT",
    DatabaseName = "DATABASE_NAME",
    DatabaseUser = "DATABASE_USER",
    DatabasePassword = "DATABASE_PASSWORD",
    BeatmapServiceUrl = "BEATMAP_SERVICE_URL",
    BeatmapServiceKey = "BEATMAP_SERVICE_KEY",
    ApiKey = "API_KEY",
    CalculationThreads = "CALCULATION_THREADS",
    CalculationMaxQueue = "CALCULATION_MAX_QUEUE",
    DevMode = "DEV_MODE",
}
