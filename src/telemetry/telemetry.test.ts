import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { rmSync, existsSync } from "node:fs"
import { join } from "node:path"
import { getOrCreateInstall, getOrCreateProject, isTelemetryEnabled, readTelemetryConfig, writeTelemetryConfig } from "./identity.js"
import { sendTelemetry } from "./send.js"

const KLARO_DIR = join(process.cwd(), ".maskea")

beforeEach(() => {
  rmSync(KLARO_DIR, { recursive: true, force: true })
})
afterEach(() => {
  rmSync(KLARO_DIR, { recursive: true, force: true })
  delete process.env.KLARO_TELEMETRY
})

describe("identity", () => {
  it("creates install.json on first call, reuses it after", () => {
    const first = getOrCreateInstall()
    expect(first.created).toBe(true)
    expect(first.install.installationId).toMatch(/^ks_/)

    const second = getOrCreateInstall()
    expect(second.created).toBe(false)
    expect(second.install.installationId).toBe(first.install.installationId)
  })

  it("creates project.json on first call, reuses it after", () => {
    const first = getOrCreateProject("my-app")
    expect(first.created).toBe(true)
    expect(first.project.projectId).toMatch(/^kp_/)
    expect(first.project.projectName).toBe("my-app")

    const second = getOrCreateProject()
    expect(second.created).toBe(false)
    expect(second.project.projectId).toBe(first.project.projectId)
  })

  it("never derives the install ID from anything machine-specific", () => {
    const { install } = getOrCreateInstall()
    // A real UUID v4 has no relation to hostname/MAC/etc -- this is a
    // structural sanity check, not exhaustive proof, but a fingerprinted
    // ID (e.g. a hash of os.hostname()) would be deterministic across
    // runs on the same machine even after deleting install.json, which a
    // real UUID never is.
    rmSync(KLARO_DIR, { recursive: true, force: true })
    const { install: second } = getOrCreateInstall()
    expect(second.installationId).not.toBe(install.installationId)
  })

  it("KLARO_TELEMETRY=0 disables regardless of config.json", () => {
    writeTelemetryConfig({ telemetry: true })
    process.env.KLARO_TELEMETRY = "0"
    expect(isTelemetryEnabled()).toBe(false)
  })

  it("KLARO_TELEMETRY=1 enables regardless of config.json", () => {
    writeTelemetryConfig({ telemetry: false })
    process.env.KLARO_TELEMETRY = "1"
    expect(isTelemetryEnabled()).toBe(true)
  })

  it("defaults to enabled with no config file", () => {
    expect(isTelemetryEnabled()).toBe(true)
  })

  it("respects config.json when no env override is set", () => {
    writeTelemetryConfig({ telemetry: false })
    expect(isTelemetryEnabled()).toBe(false)
    expect(readTelemetryConfig().telemetry).toBe(false)
  })
})

describe("sendTelemetry", () => {
  it("makes no network call at all when telemetry is disabled", async () => {
    process.env.KLARO_TELEMETRY = "0"
    const fetchSpy = vi.spyOn(globalThis, "fetch")
    sendTelemetry("doctor_run", { cliCommand: "doctor" })
    await new Promise((r) => setTimeout(r, 10))
    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })

  it("never includes prompt/response/secret-shaped fields in the payload", async () => {
    process.env.KLARO_TELEMETRY = "1"
    // Pre-create install/project so this call doesn't also fire the
    // one-time sdk_installed/project_created events -- isolates the
    // payload check to a single, predictable POST.
    getOrCreateInstall()
    getOrCreateProject()

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}"))
    sendTelemetry("doctor_run", { cliCommand: "doctor" })
    await new Promise((r) => setTimeout(r, 10))

    expect(fetchSpy).toHaveBeenCalledOnce()
    const [, init] = fetchSpy.mock.calls[0]
    const body = JSON.parse((init as RequestInit).body as string)
    const keys = Object.keys(body)
    expect(keys.sort()).toEqual(
      ["cliCommand", "eventName", "installationId", "nodeVersion", "platform", "projectId", "sdkVersion"].sort()
    )
    for (const forbidden of ["prompt", "response", "apiKey", "secret", "pii", "messages", "content"]) {
      expect(keys).not.toContain(forbidden)
    }
    fetchSpy.mockRestore()
  })
})
