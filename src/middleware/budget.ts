import type { Middleware } from "../types.js"
import { appendJsonLine, readJsonLines, writeJson } from "../storage/local-store.js"
import { extractUsage, estimateCostUsd } from "./pricing-table.js"
import { sendTelemetry } from "../telemetry/send.js"

export interface BudgetOptions {
  maxMonthlyUsd: number
  /** Only "local" exists in Release 1 -- Maskea Cloud can later aggregate budget across machines/lambdas, but that's an optional sync layer, not a requirement to use this middleware at all. */
  storage?: "local"
  /** Called (not thrown) when a call pushes spend past the cap, so the developer decides what to do -- log it, alert, or still let requests through. Default: throws. */
  onExceeded?: (spentUsd: number, capUsd: number) => void
}

interface SpendRecord {
  costUsd: number
  timestamp: string
  model?: string
}

function currentMonthKey(): string {
  const d = new Date()
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`
}

function monthToDateSpend(): number {
  const monthKey = currentMonthKey()
  return readJsonLines<SpendRecord>("budget")
    .filter((r) => r.timestamp.startsWith(monthKey))
    .reduce((sum, r) => sum + r.costUsd, 0)
}

export function budget(options: BudgetOptions): Middleware {
  sendTelemetry("middleware_budget_enabled")
  // Persisted so CLI commands (maskea stats/doctor) can show "budget
  // remaining" and similar without needing to import the developer's own
  // maskea.config.ts -- the config file is the source of truth while the
  // process is running, this is just a mirror for tooling that runs as a
  // separate process later. Written once per middleware construction, not
  // per call -- the cap doesn't change mid-run.
  writeJson("budget-config", { maxMonthlyUsd: options.maxMonthlyUsd })

  return async (args, next, ctx) => {
    // Checked BEFORE the call, using spend recorded from prior calls --
    // this can't know the cost of the call about to happen (that only
    // exists once the provider responds with real usage), so it's a
    // "don't exceed cap based on everything so far" gate, not a perfect
    // per-call preflight. Documented honestly rather than pretending to
    // block the exact call that would tip it over.
    const spentSoFar = monthToDateSpend()
    if (spentSoFar >= options.maxMonthlyUsd) {
      if (options.onExceeded) {
        options.onExceeded(spentSoFar, options.maxMonthlyUsd)
      } else {
        throw new Error(
          `[maskea] Monthly budget exceeded: $${spentSoFar.toFixed(2)} spent of $${options.maxMonthlyUsd} cap. ` +
            `Pass budget({ onExceeded }) to handle this instead of throwing.`
        )
      }
    }

    const result = await next(args)

    const usage = extractUsage(result)
    if (usage) {
      const costUsd = estimateCostUsd(usage)
      if (costUsd !== null) {
        appendJsonLine("budget", { costUsd, model: usage.model, timestamp: new Date().toISOString() })
        ctx.meta.costUsd = costUsd
        ctx.meta.model = usage.model
      }
      // costUsd === null means the model name wasn't in the pricing table --
      // silently skipped rather than thrown, per "reduce engineering work,
      // not increase it": an unrecognized model shouldn't break the call.
    }

    return result
  }
}
