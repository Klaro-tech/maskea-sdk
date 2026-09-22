import pc from "picocolors"
import { readTelemetryConfig, writeTelemetryConfig, isTelemetryEnabled, getOrCreateInstall } from "../../telemetry/identity.js"

const COLLECTED = ["SDK version", "Anonymous installation ID", "Enabled middleware", "CLI usage"]
const NEVER_COLLECTED = ["Prompts", "Responses", "API keys", "Secrets", "PII"]

export function telemetryStatus(): void {
  const enabled = isTelemetryEnabled()
  const envOverride = process.env.KLARO_TELEMETRY === "0" || process.env.KLARO_TELEMETRY === "1"

  console.log(pc.bold("Telemetry"))
  console.log(`\nStatus: ${enabled ? pc.green("Enabled") : pc.red("Disabled")}${envOverride ? pc.dim(" (set by KLARO_TELEMETRY env var)") : ""}`)

  console.log(pc.bold("\nData collected:"))
  for (const item of COLLECTED) console.log(`${pc.green("✓")} ${item}`)

  console.log(pc.bold("\nNever collected:"))
  for (const item of NEVER_COLLECTED) console.log(`${pc.red("✗")} ${item}`)

  if (enabled) {
    const { installationId } = getOrCreateInstall().install
    console.log(pc.dim(`\nInstallation ID: ${installationId}`))
  }
  console.log(pc.dim("\nDisable: npx maskea telemetry disable    Enable: npx maskea telemetry enable"))
}

export function telemetryEnable(): void {
  writeTelemetryConfig({ ...readTelemetryConfig(), telemetry: true })
  console.log(`${pc.green("✓")} Telemetry enabled.`)
}

export function telemetryDisable(): void {
  writeTelemetryConfig({ ...readTelemetryConfig(), telemetry: false })
  console.log(`${pc.green("✓")} Telemetry disabled. No data will be sent from this project.`)
  console.log(pc.dim("The SDK remains fully functional -- this only stops the anonymous usage pings."))
}
