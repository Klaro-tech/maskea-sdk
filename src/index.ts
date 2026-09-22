export { Maskea } from "./maskea.js"
export type { KlaroContext, Middleware } from "./types.js"

export { retries, type RetriesOptions } from "./middleware/retries.js"
export { budget, type BudgetOptions } from "./middleware/budget.js"
export { secrets, type SecretsOptions } from "./middleware/secrets.js"
export { pii, type PiiOptions, type PiiType } from "./middleware/pii.js"
export { vulnSignatures, type VulnSignatureOptions } from "./middleware/vuln-signatures.js"
export { validation, type ValidationOptions, type ZodLikeSchema } from "./middleware/validation.js"
export { logging, type LoggingOptions } from "./middleware/logging.js"
export { cloudSync, type CloudSyncOptions } from "./middleware/cloud-sync.js"

export { simulate, ALL_SCENARIOS, type SimulationScenario, type SimulationResult } from "./simulate.js"
export { benchmark, type BenchmarkResult, type ProviderBenchmark } from "./benchmark.js"
export { generateReport, renderMarkdown, renderJson, renderHtml, type ReportData } from "./report.js"

export { sendTelemetry, type TelemetryEvent } from "./telemetry/send.js"
export {
  getOrCreateInstall,
  getOrCreateProject,
  isTelemetryEnabled,
  readTelemetryConfig,
  writeTelemetryConfig,
  type InstallIdentity,
  type ProjectIdentity,
  type TelemetryConfig,
} from "./telemetry/identity.js"
