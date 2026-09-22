import { randomUUID } from "node:crypto"
import { readJson, writeJson } from "../storage/local-store.js"
import { sdkVersion } from "./version.js"

export interface InstallIdentity {
  installationId: string
  createdAt: string
  sdkVersion: string
}

export interface ProjectIdentity {
  projectId: string
  projectName?: string
  createdAt: string
  sdkVersion: string
}

export interface TelemetryConfig {
  telemetry: boolean
}

/**
 * A random v4 UUID, never derived from hardware -- MAC address, disk
 * serial, hostname hash, anything fingerprint-able is deliberately never
 * touched. The "ks_"/"kp_" prefixes exist only so a stray ID pasted into a
 * bug report is instantly recognizable as ours, not to encode anything
 * about the machine it came from.
 */
function newId(prefix: "ks" | "kp"): string {
  return `${prefix}_${randomUUID()}`
}

/** Created once on first run and never regenerated unless the developer deletes .maskea/install.json themselves. `created` tells the caller whether this call is the one that just made it, so sdk_installed can fire exactly once. */
export function getOrCreateInstall(): { install: InstallIdentity; created: boolean } {
  const existing = readJson<InstallIdentity | null>("install", null)
  if (existing) return { install: existing, created: false }
  const install: InstallIdentity = { installationId: newId("ks"), createdAt: new Date().toISOString(), sdkVersion: sdkVersion() }
  writeJson("install", install)
  return { install, created: true }
}

/** One project identity per .maskea/ directory (i.e. per project, since storage is cwd-relative). Created by `maskea init`, or lazily on first telemetry-emitting call if init was never run. */
export function getOrCreateProject(projectName?: string): { project: ProjectIdentity; created: boolean } {
  const existing = readJson<ProjectIdentity | null>("project", null)
  if (existing) return { project: existing, created: false }
  const project: ProjectIdentity = { projectId: newId("kp"), projectName, createdAt: new Date().toISOString(), sdkVersion: sdkVersion() }
  writeJson("project", project)
  return { project, created: true }
}

const DEFAULT_CONFIG: TelemetryConfig = { telemetry: true }

export function readTelemetryConfig(): TelemetryConfig {
  return readJson<TelemetryConfig>("config", DEFAULT_CONFIG)
}

export function writeTelemetryConfig(config: TelemetryConfig): void {
  writeJson("config", config)
}

/** KLARO_TELEMETRY=0 always wins over .maskea/config.json, per the brief's "environment variable should override configuration." */
export function isTelemetryEnabled(): boolean {
  if (process.env.KLARO_TELEMETRY === "0") return false
  if (process.env.KLARO_TELEMETRY === "1") return true
  return readTelemetryConfig().telemetry
}
