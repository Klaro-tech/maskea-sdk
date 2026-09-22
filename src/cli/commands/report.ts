import { writeFileSync } from "node:fs"
import pc from "picocolors"
import { generateReport, renderMarkdown, renderJson, renderHtml } from "../../report.js"
import { renderPdf } from "../../report-pdf.js"
import { sendTelemetry } from "../../telemetry/send.js"

export type ReportFormat = "md" | "json" | "html" | "pdf"

const DEFAULT_OUT: Record<ReportFormat, string> = {
  md: "maskea-report.md",
  json: "maskea-report.json",
  html: "maskea-report.html",
  pdf: "maskea-report.pdf",
}

export async function report(options: { format?: string; out?: string }): Promise<void> {
  sendTelemetry("report_run", { cliCommand: "report" })

  const format = (options.format ?? "md") as ReportFormat
  if (!["md", "json", "html", "pdf"].includes(format)) {
    console.log(`${pc.red("✗")} Unknown format "${options.format}" -- use md, json, html, or pdf.`)
    return
  }

  const data = generateReport()

  // PDF is binary -- unlike the text formats, it can't be printed to
  // stdout, so it always writes to a file (the given --out, or a sane
  // default) rather than requiring --out to be passed every time.
  if (format === "pdf") {
    const bytes = await renderPdf(data)
    const outPath = options.out ?? DEFAULT_OUT.pdf
    writeFileSync(outPath, bytes)
    console.log(`${pc.green("✓")} Report written to ${outPath}`)
    return
  }

  const output = format === "json" ? renderJson(data) : format === "html" ? renderHtml(data) : renderMarkdown(data)

  if (options.out) {
    writeFileSync(options.out, output, "utf8")
    console.log(`${pc.green("✓")} Report written to ${options.out}`)
  } else {
    console.log(output)
  }
}
