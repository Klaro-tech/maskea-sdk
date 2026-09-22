import pc from "picocolors"
import { readJsonLines, readJson } from "../../storage/local-store.js"
import { sendTelemetry } from "../../telemetry/send.js"

interface LogRecord {
  ok: boolean
  attempt: number
  durationMs: number
  timestamp: string
  secretHits?: { rule: string; count: number }[]
  piiHits?: { rule: string; count: number }[]
}
interface BudgetRecord {
  costUsd: number
  timestamp: string
  model?: string
}
interface BudgetConfig {
  maxMonthlyUsd: number
}

function isToday(isoTimestamp: string): boolean {
  return isoTimestamp.slice(0, 10) === new Date().toISOString().slice(0, 10)
}

function currentMonthKey(): string {
  return new Date().toISOString().slice(0, 7)
}

function sumHits(records: { count: number }[] | undefined): number {
  return (records ?? []).reduce((sum, r) => sum + r.count, 0)
}

/**
 * Weighted the same way doctor()'s score is: reliability (retry rate) and
 * redaction activity matter more than raw call volume. A project with
 * zero calls today gets no score at all rather than a misleading 100 --
 * there's nothing to score yet.
 */
function computeHealthScore(retryRate: number, failureRate: number): number {
  let score = 100
  score -= retryRate * 30 // up to -30 if every call needed a retry
  score -= failureRate * 50 // failed calls matter more than retried-then-succeeded ones
  return Math.max(0, Math.round(score))
}

export function stats(): void {
  sendTelemetry("stats_run", { cliCommand: "stats" })
  const logs = readJsonLines<LogRecord>("logs")
  const spend = readJsonLines<BudgetRecord>("budget")
  const budgetConfig = readJson<BudgetConfig | null>("budget-config", null)

  if (logs.length === 0) {
    console.log("No calls recorded yet in .maskea/logs.jsonl. Wrap a call with maskea.wrap(...) and it'll show up here.")
    return
  }

  const todaysLogs = logs.filter((l) => isToday(l.timestamp))
  const todaysSpend = spend.filter((s) => isToday(s.timestamp))
  const monthKey = currentMonthKey()
  const monthSpend = spend.filter((s) => s.timestamp.startsWith(monthKey)).reduce((sum, s) => sum + s.costUsd, 0)

  console.log(pc.dim("────────────────────────────"))
  console.log(pc.bold("Today's AI Health"))
  console.log(pc.dim("────────────────────────────\n"))

  if (todaysLogs.length === 0) {
    console.log(pc.dim("No calls yet today. Showing all-time totals instead:\n"))
  }

  const relevantLogs = todaysLogs.length > 0 ? todaysLogs : logs
  const relevantSpend = todaysLogs.length > 0 ? todaysSpend : spend

  const retriesSaved = relevantLogs.filter((l) => l.attempt > 1 && l.ok).length
  const secretsRemoved = relevantLogs.reduce((sum, l) => sum + sumHits(l.secretHits), 0)
  const piiRemoved = relevantLogs.reduce((sum, l) => sum + sumHits(l.piiHits), 0)
  const costToday = relevantSpend.reduce((sum, s) => sum + s.costUsd, 0)
  const avgLatency = relevantLogs.reduce((sum, l) => sum + l.durationMs, 0) / relevantLogs.length
  const failed = relevantLogs.filter((l) => !l.ok).length
  const retryRate = relevantLogs.filter((l) => l.attempt > 1).length / relevantLogs.length
  const failureRate = failed / relevantLogs.length

  console.log(`${pc.green("✓")} Retries Saved       ${retriesSaved}`)
  console.log(`${pc.green("✓")} Secrets Removed     ${secretsRemoved}`)
  console.log(`${pc.green("✓")} PII Removed         ${piiRemoved}`)
  console.log(`${pc.green("✓")} Cost Today          $${costToday.toFixed(2)}`)
  console.log(`${pc.green("✓")} Average Latency     ${avgLatency.toFixed(0)} ms`)
  if (budgetConfig) {
    const remaining = Math.max(0, budgetConfig.maxMonthlyUsd - monthSpend)
    console.log(`${pc.green("✓")} Budget Remaining    $${remaining.toFixed(2)}`)
  } else {
    console.log(`${pc.yellow("⚠")} Budget Remaining    ${pc.dim("no budget() middleware configured -- add .use(budget({ maxMonthlyUsd })) to track this")}`)
  }

  const score = computeHealthScore(retryRate, failureRate)
  const scoreText = score >= 90 ? pc.green(`${score}/100`) : score >= 70 ? pc.yellow(`${score}/100`) : pc.red(`${score}/100`)
  console.log(`\n${pc.bold("Health Score:")} ${scoreText}`)
  console.log(pc.dim(`\n(${relevantLogs.length} call${relevantLogs.length === 1 ? "" : "s"}, ${failed} failed, all-time spend $${spend.reduce((s, r) => s + r.costUsd, 0).toFixed(2)})`))
}
