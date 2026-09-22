import { readJsonLines, readJson } from "../storage/local-store.js"

export interface LogRecord {
  callId: string
  attempt: number
  durationMs: number
  ok: boolean
  error?: string
  secretHits?: { rule: string; count: number }[]
  piiHits?: { rule: string; count: number }[]
  timestamp: string
}
export interface BudgetRecord {
  costUsd: number
  model?: string
  timestamp: string
}
interface BudgetConfig {
  maxMonthlyUsd: number
}

export interface DashboardData {
  requests: LogRecord[] // most recent 100, newest first
  totals: {
    calls: number
    failed: number
    retriesSaved: number
    secretsRemoved: number
    piiRemoved: number
    avgLatencyMs: number
  }
  spend: {
    byDay: { date: string; costUsd: number }[] // last 30 days, for the cost chart
    byModel: { model: string; costUsd: number; calls: number }[]
    monthToDate: number
    monthlyCap: number | null
  }
  healthScore: number
}

function sumHits(records: { count: number }[] | undefined): number {
  return (records ?? []).reduce((sum, r) => sum + r.count, 0)
}

/**
 * Same computation logic as `maskea stats`, factored out so the dashboard
 * and the CLI command stay consistent instead of two independently
 * maintained copies of "what counts as retries saved" drifting apart.
 */
export function loadDashboardData(): DashboardData {
  const logs = readJsonLines<LogRecord>("logs")
  const spend = readJsonLines<BudgetRecord>("budget")
  const budgetConfig = readJson<BudgetConfig | null>("budget-config", null)

  const retriesSaved = logs.filter((l) => l.attempt > 1 && l.ok).length
  const secretsRemoved = logs.reduce((sum, l) => sum + sumHits(l.secretHits), 0)
  const piiRemoved = logs.reduce((sum, l) => sum + sumHits(l.piiHits), 0)
  const failed = logs.filter((l) => !l.ok).length
  const avgLatencyMs = logs.length ? logs.reduce((sum, l) => sum + l.durationMs, 0) / logs.length : 0
  const retryRate = logs.length ? logs.filter((l) => l.attempt > 1).length / logs.length : 0
  const failureRate = logs.length ? failed / logs.length : 0

  const byDayMap = new Map<string, number>()
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000
  for (const s of spend) {
    const t = new Date(s.timestamp).getTime()
    if (t < thirtyDaysAgo) continue
    const day = s.timestamp.slice(0, 10)
    byDayMap.set(day, (byDayMap.get(day) ?? 0) + s.costUsd)
  }
  const byDay = Array.from(byDayMap.entries()).map(([date, costUsd]) => ({ date, costUsd })).sort((a, b) => a.date.localeCompare(b.date))

  const byModelMap = new Map<string, { costUsd: number; calls: number }>()
  for (const s of spend) {
    if (!s.model) continue
    const entry = byModelMap.get(s.model) ?? { costUsd: 0, calls: 0 }
    entry.costUsd += s.costUsd
    entry.calls++
    byModelMap.set(s.model, entry)
  }
  const byModel = Array.from(byModelMap.entries()).map(([model, v]) => ({ model, ...v }))

  const monthKey = new Date().toISOString().slice(0, 7)
  const monthToDate = spend.filter((s) => s.timestamp.startsWith(monthKey)).reduce((sum, s) => sum + s.costUsd, 0)

  let healthScore = 100
  healthScore -= retryRate * 30
  healthScore -= failureRate * 50
  healthScore = Math.max(0, Math.round(healthScore))

  return {
    requests: logs.slice(-100).reverse(),
    totals: { calls: logs.length, failed, retriesSaved, secretsRemoved, piiRemoved, avgLatencyMs },
    spend: { byDay, byModel, monthToDate, monthlyCap: budgetConfig?.maxMonthlyUsd ?? null },
    healthScore,
  }
}
