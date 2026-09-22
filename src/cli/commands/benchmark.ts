import pc from "picocolors"
import ora from "ora"
import { benchmark as runBenchmark } from "../../benchmark.js"
import { readJsonLines } from "../../storage/local-store.js"
import { sendTelemetry } from "../../telemetry/send.js"

interface BudgetRecord {
  costUsd: number
  model?: string
  timestamp: string
}

/**
 * Estimated monthly savings, grounded in this project's OWN recorded
 * spend (.maskea/budget.jsonl), not a made-up figure -- if there's no
 * recorded spend yet, this section is skipped honestly rather than
 * inventing a number.
 */
function estimateMonthlySavings(cheapestCostUsd: number): { currentMonthlySpend: number; projectedSavings: number } | null {
  const spend = readJsonLines<BudgetRecord>("budget")
  if (spend.length === 0) return null

  const monthKey = new Date().toISOString().slice(0, 7)
  const thisMonth = spend.filter((s) => s.timestamp.startsWith(monthKey))
  if (thisMonth.length === 0) return null

  const currentMonthlySpend = thisMonth.reduce((sum, s) => sum + s.costUsd, 0)
  const avgCostPerCall = currentMonthlySpend / thisMonth.length
  if (avgCostPerCall <= cheapestCostUsd) return null // already cheaper than the benchmark winner -- nothing to project

  const projectedMonthlySpend = cheapestCostUsd * thisMonth.length
  return { currentMonthlySpend, projectedSavings: currentMonthlySpend - projectedMonthlySpend }
}

export async function benchmark(): Promise<void> {
  sendTelemetry("benchmark_run", { cliCommand: "benchmark" })
  console.log(pc.bold("Benchmarking Providers"))

  const spinner = ora("Sending a real test call to each configured provider...").start()
  const { results, recommendation } = await runBenchmark()
  spinner.stop()
  console.log()

  // Markdown table -- copy-pasteable straight into a PR description or
  // Slack message, which is the actual reason to format it this way
  // instead of plain aligned columns.
  console.log("| Provider | Model | Latency | Cost | Status |")
  console.log("|---|---|---|---|---|")
  for (const r of results) {
    const latencyStr = r.latencyMs !== undefined ? `${r.latencyMs}ms` : "—"
    const costStr = r.costUsd !== undefined ? (r.costUsd === 0 ? "$0 (local)" : `$${r.costUsd.toFixed(4)}`) : "—"
    const statusStr = r.ok ? pc.green("✓") : `${pc.yellow("⚠")} ${r.error}`
    console.log(`| ${r.provider} | ${r.model} | ${latencyStr} | ${costStr} | ${statusStr} |`)
  }

  if (!recommendation) {
    console.log(`\n${pc.dim("No provider with both a configured key and known pricing responded successfully -- nothing to recommend.")}`)
    return
  }

  console.log(`\n${pc.bold("Recommendation:")} ${recommendation.provider} (${recommendation.model}) — ${recommendation.reason}`)

  const cheapest = results.find((r) => r.provider === recommendation.provider && r.model === recommendation.model)
  if (cheapest?.costUsd !== undefined) {
    const savings = estimateMonthlySavings(cheapest.costUsd)
    if (savings) {
      console.log(`${pc.bold("Estimated monthly savings:")} ${pc.green(`$${savings.projectedSavings.toFixed(2)}`)} (based on this month's recorded usage: $${savings.currentMonthlySpend.toFixed(2)} so far)`)
    }
  }
}
