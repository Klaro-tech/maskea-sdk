import { getOrCreateInstall, getOrCreateProject, isTelemetryEnabled } from "./identity.js"
import { sdkVersion } from "./version.js"

export type TelemetryEvent =
  | "sdk_installed"
  | "project_created"
  | "doctor_run"
  | "stats_run"
  | "simulate_run"
  | "benchmark_run"
  | "dashboard_opened"
  | "report_run"
  | "middleware_retry_enabled"
  | "middleware_budget_enabled"
  | "middleware_pii_enabled"
  | "middleware_secret_enabled"
  | "middleware_vuln_signatures_enabled"
  | "middleware_validation_enabled"
  | "cloud_login"
  | "cloud_project_connected"

const DEFAULT_ENDPOINT = "https://maskea.services/api/maskea/telemetry"

/**
 * Anonymous operational metadata only -- installationId/projectId (random
 * UUIDs, see identity.ts), SDK/Node version, platform, which middleware
 * names are configured, which CLI command ran. NEVER the developer's
 * prompts, responses, API keys, secrets, PII, or any local file path.
 * There is no code path in this file that reads request/response bodies
 * at all -- it only receives the fixed fields below as arguments.
 *
 * Fire-and-forget by design: a network failure, a slow DNS lookup, or the
 * telemetry endpoint being down must never delay or fail the developer's
 * actual CLI command or SDK call. Errors are swallowed silently, capped
 * at a 2s timeout so a hung connection can't hang the process either.
 */
function post(installationId: string, projectId: string, eventName: TelemetryEvent, extra?: { cliCommand?: string; middleware?: string[] }): void {
  const endpoint = process.env.KLARO_TELEMETRY_ENDPOINT ?? DEFAULT_ENDPOINT
  const payload = {
    installationId,
    projectId,
    eventName,
    sdkVersion: sdkVersion(),
    nodeVersion: process.version,
    platform: process.platform,
    cliCommand: extra?.cliCommand,
    middleware: extra?.middleware,
  }
  fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(2000),
  }).catch(() => {
    // Deliberately silent -- see the fire-and-forget note above.
  })
}

export function sendTelemetry(eventName: TelemetryEvent, extra?: { cliCommand?: string; middleware?: string[] }): void {
  if (!isTelemetryEnabled()) return

  const { install, created: installCreated } = getOrCreateInstall()
  const { project, created: projectCreated } = getOrCreateProject()

  // sdk_installed/project_created fire exactly once -- the call that
  // actually creates install.json/project.json, not every subsequent
  // command that happens to touch an existing one.
  if (installCreated) post(install.installationId, project.projectId, "sdk_installed")
  if (projectCreated) post(install.installationId, project.projectId, "project_created")

  post(install.installationId, project.projectId, eventName, extra)
}
