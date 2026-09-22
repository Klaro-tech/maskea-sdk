import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { rmSync } from "node:fs"
import { join } from "node:path"
import { appendJsonLine, writeJson } from "./storage/local-store.js"
import { generateReport, renderMarkdown, renderJson, renderHtml } from "./report.js"

const KLARO_DIR = join(process.cwd(), ".maskea")

beforeEach(() => {
  rmSync(KLARO_DIR, { recursive: true, force: true })
})
afterEach(() => {
  rmSync(KLARO_DIR, { recursive: true, force: true })
})

function seed() {
  appendJsonLine("logs", { callId: "aaa", attempt: 1, durationMs: 220, ok: true, piiHits: [{ rule: "email", count: 1 }], timestamp: "2026-08-08T16:06:49.000Z" })
  appendJsonLine("logs", { callId: "bbb", attempt: 1, durationMs: 430, ok: false, error: "429", timestamp: "2026-08-08T16:06:48.000Z" })
  appendJsonLine("logs", { callId: "bbb", attempt: 2, durationMs: 500, ok: true, timestamp: "2026-08-08T16:06:49.000Z" })
  appendJsonLine("budget", { costUsd: 0.02, model: "gpt-4o-mini", timestamp: "2026-08-08T16:06:49.000Z" })
  writeJson("budget-config", { maxMonthlyUsd: 50 })
}

describe("generateReport", () => {
  it("stamps generatedAt and sdkVersion on top of the real dashboard data", () => {
    seed()
    const r = generateReport()
    expect(r.totals.calls).toBe(3)
    expect(r.totals.retriesSaved).toBe(1)
    expect(r.totals.piiRemoved).toBe(1)
    expect(r.spend.monthlyCap).toBe(50)
    expect(typeof r.generatedAt).toBe("string")
    expect(typeof r.sdkVersion).toBe("string")
  })

  it("handles an empty project without throwing", () => {
    const r = generateReport()
    expect(r.totals.calls).toBe(0)
    expect(r.healthScore).toBe(100)
  })
})

describe("renderMarkdown", () => {
  it("includes the real numbers, not placeholders", () => {
    seed()
    const md = renderMarkdown(generateReport())
    expect(md).toContain("Total Calls | 3")
    expect(md).toContain("Retries Saved | 1")
    expect(md).toContain("PII Removed | 1")
    expect(md).toContain("gpt-4o-mini")
  })

  it("says so honestly when there's no data yet", () => {
    const md = renderMarkdown(generateReport())
    expect(md).toContain("No calls recorded yet.")
  })
})

describe("renderJson", () => {
  it("round-trips as valid JSON with the same totals", () => {
    seed()
    const parsed = JSON.parse(renderJson(generateReport()))
    expect(parsed.totals.calls).toBe(3)
  })
})

describe("renderHtml", () => {
  it("produces valid-looking HTML containing the health score", () => {
    seed()
    const html = renderHtml(generateReport())
    expect(html).toContain("<!doctype html>")
    expect(html).toMatch(/\d+\/100/)
  })
})
