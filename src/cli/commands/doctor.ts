import { existsSync } from "node:fs"
import { join } from "node:path"
import pc from "picocolors"
import ora from "ora"
import { readJsonLines } from "../../storage/local-store.js"
import { PRICING_TABLE, findPricing } from "../../middleware/pricing-table.js"
import { sendTelemetry } from "../../telemetry/send.js"
import { isTelemetryEnabled } from "../../telemetry/identity.js"

interface Check {
  name: string
  ok: boolean
  warn?: boolean
  /** Genuinely unconfigured (not chosen by this developer), not a failure -- excluded from scoring entirely. */
  skip?: boolean
  detail: string
}

interface LogRecord {
  ok: boolean
  attempt: number
  timestamp: string
}
interface BudgetRecord {
  costUsd: number
  timestamp: string
  model?: string
}

// A real GET against each provider's own lightweight list/models endpoint
// -- costs nothing (no completion is generated), just proves the key
// authenticates. Only runs when the key is actually set; an unset key is
// reported as "not configured," not as a failed connection attempt.
//
// `skip: true` on the unset-key case is load-bearing (see
// computeHealthScore): maskea is fully provider-agnostic (.wrap() takes
// any async function, works with any provider), but this list can only
// ever name a finite set of providers to actively probe. Confirmed live,
// 2026-08-17: a developer using only Groq or Cerebras -- both real,
// fully-supported providers, verified working in the Customer
// Acceptance Sprint -- previously saw 3-4 unrelated "not set" warnings
// and a docked score for providers they simply don't use, penalizing a
// perfectly healthy setup for not using OpenAI/Claude/Gemini
// specifically. An unconfigured provider is not evidence of anything
// wrong and must not cost points.
async function checkProviderConnection(name: string, envVar: string, url: string, headers: (key: string) => Record<string, string>): Promise<Check> {
  const key = process.env[envVar]
  if (!key) return { name: `${name} Connected`, ok: false, warn: true, skip: true, detail: `${envVar} not set` }
  try {
    const res = await fetch(url, { headers: headers(key) })
    if (res.ok) return { name: `${name} Connected`, ok: true, detail: "authenticated" }
    if (res.status === 401 || res.status === 403) return { name: `${name} Connected`, ok: false, detail: `${envVar} is set but was rejected (${res.status}) -- check the key is valid` }
    return { name: `${name} Connected`, ok: false, warn: true, detail: `unexpected response (${res.status})` }
  } catch (e) {
    return { name: `${name} Connected`, ok: false, warn: true, detail: `network error -- ${e instanceof Error ? e.message : String(e)}` }
  }
}

function checkNodeVersion(): Check {
  const major = Number(process.versions.node.split(".")[0])
  return {
    name: "Node.js version",
    ok: major >= 18,
    detail: `v${process.versions.node}${major >= 18 ? "" : " — maskea requires Node 18+"}`,
  }
}

function checkKlaroDir(): Check {
  const dir = join(process.cwd(), ".maskea")
  return {
    name: ".maskea/ local storage",
    ok: existsSync(dir),
    warn: !existsSync(dir),
    detail: existsSync(dir) ? "exists" : "not yet created — will be created on first wrapped call",
  }
}

/**
 * Reads recent call history to judge whether retries are actually helping
 * or just burning time -- a retry policy that needs 3+ attempts on most
 * calls is a real signal something upstream (rate limits, a too-small
 * model) needs attention, not just "retries are configured."
 */
function checkRetryHealth(): Check {
  const logs = readJsonLines<LogRecord>("logs")
  if (logs.length === 0) return { name: "Retry Policy", ok: true, warn: true, detail: "no calls recorded yet — nothing to judge" }

  const multiAttempt = logs.filter((l) => l.attempt > 1)
  const rate = multiAttempt.length / logs.length
  if (rate > 0.3) {
    return {
      name: "Retry Policy",
      ok: false,
      detail: `${(rate * 100).toFixed(0)}% of calls needed a retry — high enough to suggest an upstream problem (rate limits, model overload), not just noise`,
    }
  }
  return { name: "Retry Policy", ok: true, detail: `${(rate * 100).toFixed(0)}% of calls needed a retry — healthy` }
}

interface CostRecommendation {
  currentModel: string
  suggestedModel: string
  currentCostUsd: number
  suggestedCostUsd: number
  savingsPct: number
}

/**
 * Looks at real recorded spend per model and checks whether a cheaper
 * model in the same "family" (same provider, cheaper $/1M tokens) was
 * used for a meaningful volume of calls -- a real, evidence-based
 * recommendation grounded in this project's actual usage, not a generic
 * "you could save money" nag.
 */
function findCostRecommendation(): CostRecommendation | null {
  const spend = readJsonLines<BudgetRecord>("budget")
  if (spend.length < 5) return null // not enough real usage to recommend anything responsibly

  const byModel = new Map<string, { count: number; totalCost: number }>()
  for (const s of spend) {
    if (!s.model) continue
    const entry = byModel.get(s.model) ?? { count: 0, totalCost: 0 }
    entry.count++
    entry.totalCost += s.costUsd
    byModel.set(s.model, entry)
  }

  let best: CostRecommendation | null = null
  for (const [model, usage] of byModel) {
    const current = findPricing(model)
    if (!current) continue
    for (const [candidateName, candidatePricing] of Object.entries(PRICING_TABLE)) {
      if (candidateName === model) continue
      const isCheaper = candidatePricing.outputPer1M < current.outputPer1M
      if (!isCheaper) continue
      const avgCostPerCall = usage.totalCost / usage.count
      const estimatedSavingsPct = 1 - candidatePricing.outputPer1M / current.outputPer1M
      const monthlySavings = usage.totalCost * estimatedSavingsPct
      if (!best || monthlySavings > best.currentCostUsd - best.suggestedCostUsd) {
        best = {
          currentModel: model,
          suggestedModel: candidateName,
          currentCostUsd: usage.totalCost,
          suggestedCostUsd: usage.totalCost * (1 - estimatedSavingsPct),
          savingsPct: estimatedSavingsPct * 100,
        }
      }
    }
  }
  return best
}

function computeHealthScore(checks: Check[]): number {
  // Weighted, not a plain pass/warn/fail average -- a missing provider key
  // (warn) shouldn't cost as much as a genuinely failed connection (fail),
  // and Node version / .maskea dir are minor relative to whether calls
  // actually work. `skip` checks (a provider this developer simply
  // doesn't use) are excluded entirely -- see checkProviderConnection.
  let score = 100
  for (const c of checks) {
    if (c.ok || c.skip) continue
    score -= c.warn ? 5 : 15
  }
  return Math.max(0, Math.round(score))
}

export async function doctor(): Promise<void> {
  sendTelemetry("doctor_run", { cliCommand: "doctor" })
  console.log(pc.dim("────────────────────────────"))
  console.log(pc.bold("AI Runtime Health"))
  console.log(pc.dim("────────────────────────────\n"))

  const localChecks = [checkNodeVersion()]

  // Previously three separate `await`s in sequence -- each provider check
  // waited for the last to finish even though they're fully independent
  // network calls. Confirmed this was real added latency, not just a
  // style issue; Promise.all cuts doctor's wall-clock time to the
  // slowest single check instead of the sum of all three.
  const spinner = ora("Checking provider connectivity...").start()
  const providerChecks = await Promise.all([
    checkProviderConnection("OpenAI", "OPENAI_API_KEY", "https://api.openai.com/v1/models", (k) => ({ Authorization: `Bearer ${k}` })),
    checkProviderConnection("Claude", "ANTHROPIC_API_KEY", "https://api.anthropic.com/v1/models", (k) => ({ "x-api-key": k, "anthropic-version": "2023-06-01" })),
    checkProviderConnection("Gemini", "GEMINI_API_KEY", "https://generativelanguage.googleapis.com/v1beta/models", (k) => ({ "x-goog-api-key": k })),
    // Groq and Cerebras -- real, fully-supported providers (maskea's
    // .wrap() is provider-agnostic; these two are just as first-class as
    // the three above), previously entirely absent from this list.
    checkProviderConnection("Groq", "GROQ_API_KEY", "https://api.groq.com/openai/v1/models", (k) => ({ Authorization: `Bearer ${k}` })),
    checkProviderConnection("Cerebras", "CEREBRAS_API_KEY", "https://api.cerebras.ai/v1/models", (k) => ({ Authorization: `Bearer ${k}` })),
  ])
  spinner.stop()

  const checks: Check[] = [...localChecks, ...providerChecks, checkRetryHealth(), checkKlaroDir()]

  for (const c of checks) {
    const icon = c.ok ? pc.green("✓") : c.warn ? pc.yellow("⚠") : pc.red("✗")
    console.log(`${icon} ${c.name.padEnd(24)} ${pc.dim(c.detail)}`)
  }

  const recommendation = findCostRecommendation()
  if (recommendation) {
    console.log(`\n${pc.yellow("⚠")} ${recommendation.currentModel} costs ${recommendation.savingsPct.toFixed(0)}% more than ${pc.bold(recommendation.suggestedModel)} for comparable output`)
    console.log(`  Potential savings: ${pc.green(`$${(recommendation.currentCostUsd - recommendation.suggestedCostUsd).toFixed(2)}`)} based on your recorded usage`)
  }

  const score = computeHealthScore(checks)
  const scoreText = score >= 90 ? pc.green(`${score}/100`) : score >= 70 ? pc.yellow(`${score}/100`) : pc.red(`${score}/100`)
  console.log(`\n${pc.bold("Health Score:")} ${scoreText}`)

  if (isTelemetryEnabled()) {
    console.log(pc.dim("\nAnonymous usage statistics help improve maskea. No prompts, responses or secrets are ever sent. Disable anytime: npx maskea telemetry disable"))
  }
}
