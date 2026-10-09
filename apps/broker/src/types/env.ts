/**
 * Environment variable keys used by the broker.
 */
export enum EnvironmentVariableKey {
    Port = "PORT",
    DatabaseHost = "DATABASE_HOST",
    DatabasePort = "DATABASE_PORT",
    DatabaseName = "DATABASE_NAME",
    DatabaseUser = "DATABASE_USER",
    DatabasePassword = "DATABASE_PASSWORD",
    ProcessorApiKey = "PROCESSOR_API_KEY",
    ProcessorTimeoutSeconds = "PROCESSOR_TIMEOUT_SECONDS",
    HealthCheckIntervalSeconds = "HEALTH_CHECK_INTERVAL_SECONDS",
    HealthCheckTimeoutSeconds = "HEALTH_CHECK_TIMEOUT_SECONDS",
    RegistryReloadIntervalSeconds = "REGISTRY_RELOAD_INTERVAL_SECONDS",
    AnonymousRateLimit = "ANON_RATE_LIMIT",
    TrustProxy = "TRUST_PROXY",
    UsageSummaryIntervalSeconds = "USAGE_SUMMARY_INTERVAL_SECONDS",
}
