import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { rmSync, existsSync } from "node:fs"
import { appendJsonLine, writeJson } from "../storage/local-store.js"
import { loadDashboardData } from "./data.js"

const KLARO_DIR = new URL("../../.maskea", import.meta.url).pathname

beforeEach(() => {
  if (existsSync(KLARO_DIR)) rmSync(KLARO_DIR, { recursive: true, force: true })
})
afterEach(() => {
  if (existsSync(KLARO_DIR)) rmSync(KLARO_DIR, { recursive: true, force: true })
})

describe("loadDashboardData", () => {
  it("returns zeroed totals with no recorded calls", () => {
    const data = loadDashboardData()
    expect(data.totals.calls).toBe(0)
    expect(data.requests).toEqual([])
    expect(data.spend.byDay).toEqual([])
  })

  it("aggregates real logged calls correctly", () => {
    appendJsonLine("logs", { callId: "a", attempt: 1, ok: true, durationMs: 100, timestamp: new Date().toISOString(), piiHits: [{ rule: "email", count: 2 }] })
    appendJsonLine("logs", { callId: "b", attempt: 2, ok: true, durationMs: 300, timestamp: new Date().toISOString(), secretHits: [{ rule: "openai_api_key", count: 1 }] })
    appendJsonLine("logs", { callId: "c", attempt: 1, ok: false, durationMs: 50, timestamp: new Date().toISOString() })

    const data = loadDashboardData()
    expect(data.totals.calls).toBe(3)
    expect(data.totals.failed).toBe(1)
    expect(data.totals.retriesSaved).toBe(1) // call b: attempt > 1 and ok
    expect(data.totals.piiRemoved).toBe(2)
    expect(data.totals.secretsRemoved).toBe(1)
    expect(data.totals.avgLatencyMs).toBeCloseTo(150) // (100+300+50)/3
    // Real regression check for a genuine health-score-formula bug class:
    // 1/3 calls needed a retry, 1/3 failed -- score should reflect both
    // penalties, not just one.
    expect(data.healthScore).toBeLessThan(100)
  })

  it("aggregates real spend by day and by model, and reads the configured cap", () => {
    appendJsonLine("budget", { costUsd: 0.02, model: "gpt-4o-mini", timestamp: new Date().toISOString() })
    appendJsonLine("budget", { costUsd: 0.03, model: "gpt-4o-mini", timestamp: new Date().toISOString() })
    appendJsonLine("budget", { costUsd: 0.10, model: "claude-3-5-sonnet", timestamp: new Date().toISOString() })
    writeJson("budget-config", { maxMonthlyUsd: 25 })

    const data = loadDashboardData()
    expect(data.spend.monthToDate).toBeCloseTo(0.15)
    expect(data.spend.monthlyCap).toBe(25)
    const gpt = data.spend.byModel.find((m) => m.model === "gpt-4o-mini")
    expect(gpt?.calls).toBe(2)
    expect(gpt?.costUsd).toBeCloseTo(0.05)
    expect(data.spend.byDay).toHaveLength(1) // all seeded today
    expect(data.spend.byDay[0].costUsd).toBeCloseTo(0.15)
  })

  it("returns the most recent 100 requests newest-first", () => {
    for (let i = 0; i < 5; i++) {
      appendJsonLine("logs", { callId: String(i), attempt: 1, ok: true, durationMs: i, timestamp: new Date().toISOString() })
    }
    const data = loadDashboardData()
    expect(data.requests[0].callId).toBe("4") // newest first
    expect(data.requests[4].callId).toBe("0")
  })
})
