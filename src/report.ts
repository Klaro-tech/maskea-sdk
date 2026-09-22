import { loadDashboardData, type DashboardData } from "./dashboard/data.js"
import { sdkVersion } from "./telemetry/version.js"

export interface ReportData extends DashboardData {
  generatedAt: string
  sdkVersion: string
}

/** Same computation as the dashboard/maskea stats -- generateReport() doesn't re-derive anything, just adds a timestamp/version stamp on top of loadDashboardData()'s real numbers. */
export function generateReport(): ReportData {
  const data = loadDashboardData()
  return { ...data, generatedAt: new Date().toISOString(), sdkVersion: sdkVersion() }
}

function fmtCost(n: number): string {
  return `$${n.toFixed(4)}`
}

export function renderMarkdown(r: ReportData): string {
  const lines: string[] = []
  lines.push(`# maskea AI Runtime Report`)
  lines.push(``)
  lines.push(`Generated ${r.generatedAt} — @maskea/sdk v${r.sdkVersion}`)
  lines.push(``)
  lines.push(`## Summary`)
  lines.push(``)
  lines.push(`| Metric | Value |`)
  lines.push(`|---|---|`)
  lines.push(`| Health Score | ${r.healthScore}/100 |`)
  lines.push(`| Total Calls | ${r.totals.calls} |`)
  lines.push(`| Failed Calls | ${r.totals.failed} |`)
  lines.push(`| Retries Saved | ${r.totals.retriesSaved} |`)
  lines.push(`| Secrets Removed | ${r.totals.secretsRemoved} |`)
  lines.push(`| PII Removed | ${r.totals.piiRemoved} |`)
  lines.push(`| Avg Latency | ${Math.round(r.totals.avgLatencyMs)}ms |`)
  lines.push(`| Spend (month to date) | ${fmtCost(r.spend.monthToDate)} |`)
  lines.push(`| Budget Cap | ${r.spend.monthlyCap !== null ? `$${r.spend.monthlyCap}` : "not set"} |`)
  lines.push(``)

  if (r.spend.byModel.length > 0) {
    lines.push(`## Spend by model`)
    lines.push(``)
    lines.push(`| Model | Calls | Spend |`)
    lines.push(`|---|---|---|`)
    for (const m of r.spend.byModel) {
      lines.push(`| ${m.model} | ${m.calls} | ${fmtCost(m.costUsd)} |`)
    }
    lines.push(``)
  }

  if (r.spend.byDay.length > 0) {
    lines.push(`## Spend, last 30 days`)
    lines.push(``)
    lines.push(`| Date | Spend |`)
    lines.push(`|---|---|`)
    for (const d of r.spend.byDay) {
      lines.push(`| ${d.date} | ${fmtCost(d.costUsd)} |`)
    }
    lines.push(``)
  }

  lines.push(`## Recent requests`)
  lines.push(``)
  if (r.requests.length === 0) {
    lines.push(`No calls recorded yet.`)
  } else {
    lines.push(`| Time | Status | Latency | Redactions |`)
    lines.push(`|---|---|---|---|`)
    for (const req of r.requests.slice(0, 20)) {
      const badges = [
        req.secretHits?.length ? "secrets" : null,
        req.piiHits?.length ? "PII" : null,
      ].filter(Boolean).join(", ") || "—"
      lines.push(`| ${new Date(req.timestamp).toLocaleString()} | ${req.ok ? "ok" : "failed"} | ${req.durationMs}ms | ${badges} |`)
    }
    if (r.requests.length > 20) lines.push(``, `_...and ${r.requests.length - 20} more. Full data: .maskea/logs.jsonl_`)
  }
  lines.push(``)

  return lines.join("\n")
}

export function renderJson(r: ReportData): string {
  return JSON.stringify(r, null, 2)
}

export function renderHtml(r: ReportData): string {
  const rows = r.requests.slice(0, 20).map((req) => {
    const badges = [req.secretHits?.length ? "secrets" : null, req.piiHits?.length ? "PII" : null].filter(Boolean).join(", ") || "—"
    return `<tr><td>${new Date(req.timestamp).toLocaleString()}</td><td>${req.ok ? "ok" : "failed"}</td><td>${req.durationMs}ms</td><td>${badges}</td></tr>`
  }).join("")

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>maskea AI Runtime Report</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 720px; margin: 40px auto; padding: 0 20px; color: #1a1a2e; }
  h1 { font-size: 22px; }
  .meta { color: #71717a; font-size: 13px; margin-bottom: 24px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 24px; font-size: 13px; }
  th, td { text-align: left; padding: 6px 10px; border-bottom: 1px solid #e5e7eb; }
  th { color: #71717a; }
</style>
</head>
<body>
<h1>maskea AI Runtime Report</h1>
<p class="meta">Generated ${r.generatedAt} — @maskea/sdk v${r.sdkVersion}</p>

<table>
<tr><th>Health Score</th><td>${r.healthScore}/100</td></tr>
<tr><th>Total Calls</th><td>${r.totals.calls}</td></tr>
<tr><th>Failed Calls</th><td>${r.totals.failed}</td></tr>
<tr><th>Retries Saved</th><td>${r.totals.retriesSaved}</td></tr>
<tr><th>Secrets Removed</th><td>${r.totals.secretsRemoved}</td></tr>
<tr><th>PII Removed</th><td>${r.totals.piiRemoved}</td></tr>
<tr><th>Avg Latency</th><td>${Math.round(r.totals.avgLatencyMs)}ms</td></tr>
<tr><th>Spend (month to date)</th><td>${fmtCost(r.spend.monthToDate)}</td></tr>
<tr><th>Budget Cap</th><td>${r.spend.monthlyCap !== null ? `$${r.spend.monthlyCap}` : "not set"}</td></tr>
</table>

<h2>Recent requests</h2>
<table>
<thead><tr><th>Time</th><th>Status</th><th>Latency</th><th>Redactions</th></tr></thead>
<tbody>${rows || '<tr><td colspan="4">No calls recorded yet.</td></tr>'}</tbody>
</table>
</body>
</html>`
}
