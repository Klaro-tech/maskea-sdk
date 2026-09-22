// PDF export for `maskea report --format pdf` -- same pdf-lib drawing
// style as maskea-services' lib/sentinel/reports/*-pdf.ts builders (simple
// text/rule/newline helpers, page-break-aware). Pure function: takes the
// same ReportData generateReport() already computes for md/json/html, no
// re-derivation, no new data source.
import { PDFDocument, StandardFonts, rgb } from "pdf-lib"
import type { ReportData } from "./report.js"

const PURPLE = rgb(0.427, 0.227, 0.878) // #6D3AE0
const INK = rgb(0.10, 0.10, 0.18)
const GREY = rgb(0.42, 0.42, 0.48)
const LINE = rgb(0.91, 0.92, 0.95)
const GREEN = rgb(0.09, 0.64, 0.29)
const RED = rgb(0.78, 0.16, 0.16)

function fmtCost(n: number): string {
  return `$${n.toFixed(4)}`
}

export async function renderPdf(r: ReportData): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const ML = 50, MR = 545, PAGE_W = 595, PAGE_H = 842
  let page = doc.addPage([PAGE_W, PAGE_H])
  let y = 792

  function t(s: string, x: number, size: number, f = font, color = INK) {
    page.drawText(s, { x, y, size, font: f, color })
  }
  function rule(yy = y) {
    page.drawLine({ start: { x: ML, y: yy }, end: { x: MR, y: yy }, thickness: 0.7, color: LINE })
  }
  function nl(px: number) { y -= px }
  function ensure(space: number) {
    if (y - space < 70) {
      page = doc.addPage([PAGE_W, PAGE_H])
      y = 792
    }
  }
  function row(cells: { text: string; x: number; color?: ReturnType<typeof rgb>; f?: typeof font }[], size = 10) {
    for (const c of cells) t(c.text, c.x, size, c.f ?? font, c.color ?? INK)
  }

  // Header
  t("maskea", ML, 20, bold, PURPLE)
  t("AI Runtime Report", ML, 12, font, GREY)
  nl(18)
  t(`Generated ${new Date(r.generatedAt).toLocaleString()} — @maskea/sdk v${r.sdkVersion}`, ML, 9, font, GREY)
  nl(22)
  rule()
  nl(24)

  // Summary
  t("Summary", ML, 13, bold)
  nl(20)
  const healthColor = r.healthScore >= 80 ? GREEN : r.healthScore >= 50 ? rgb(0.6, 0.4, 0) : RED
  const summaryRows: [string, string, ReturnType<typeof rgb>?][] = [
    ["Health Score", `${r.healthScore}/100`, healthColor],
    ["Total Calls", String(r.totals.calls)],
    ["Failed Calls", String(r.totals.failed)],
    ["Retries Saved", String(r.totals.retriesSaved)],
    ["Secrets Removed", String(r.totals.secretsRemoved)],
    ["PII Removed", String(r.totals.piiRemoved)],
    ["Avg Latency", `${Math.round(r.totals.avgLatencyMs)}ms`],
    ["Spend (month to date)", fmtCost(r.spend.monthToDate)],
    ["Budget Cap", r.spend.monthlyCap !== null ? `$${r.spend.monthlyCap}` : "not set"],
  ]
  for (const [label, value, color] of summaryRows) {
    ensure(20)
    t(label, ML, 10, font, GREY)
    t(value, ML + 220, 10, bold, color ?? INK)
    nl(18)
  }
  nl(10)

  // Spend by model
  if (r.spend.byModel.length > 0) {
    ensure(40)
    rule()
    nl(24)
    t("Spend by model", ML, 13, bold)
    nl(20)
    row([{ text: "Model", x: ML, f: bold, color: GREY }, { text: "Calls", x: ML + 260, f: bold, color: GREY }, { text: "Spend", x: ML + 340, f: bold, color: GREY }], 9)
    nl(16)
    for (const m of r.spend.byModel) {
      ensure(18)
      row([{ text: m.model, x: ML }, { text: String(m.calls), x: ML + 260 }, { text: fmtCost(m.costUsd), x: ML + 340 }])
      nl(16)
    }
    nl(10)
  }

  // Recent requests
  ensure(40)
  rule()
  nl(24)
  t("Recent requests", ML, 13, bold)
  nl(20)
  if (r.requests.length === 0) {
    t("No calls recorded yet.", ML, 10, font, GREY)
    nl(18)
  } else {
    row(
      [
        { text: "Time", x: ML, f: bold, color: GREY },
        { text: "Status", x: ML + 180, f: bold, color: GREY },
        { text: "Latency", x: ML + 260, f: bold, color: GREY },
        { text: "Redactions", x: ML + 340, f: bold, color: GREY },
      ],
      9
    )
    nl(16)
    for (const req of r.requests.slice(0, 30)) {
      ensure(16)
      const badges = [req.secretHits?.length ? "secrets" : null, req.piiHits?.length ? "PII" : null].filter(Boolean).join(", ") || "—"
      row([
        { text: new Date(req.timestamp).toLocaleString(), x: ML },
        { text: req.ok ? "ok" : "failed", x: ML + 180, color: req.ok ? GREEN : RED },
        { text: `${req.durationMs}ms`, x: ML + 260 },
        { text: badges, x: ML + 340 },
      ], 9)
      nl(15)
    }
    if (r.requests.length > 30) {
      ensure(16)
      t(`...and ${r.requests.length - 30} more. Full data: .maskea/logs.jsonl`, ML, 9, font, GREY)
    }
  }

  return doc.save()
}
