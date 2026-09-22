import pc from "picocolors"
import { readJsonLines } from "../../storage/local-store.js"

interface LogRecord {
  callId: string
  attempt: number
  durationMs: number
  ok: boolean
  error?: string
  secretHits?: { rule: string; count: number }[]
  piiHits?: { rule: string; count: number }[]
  timestamp: string
}

export function inspect(limit: number): void {
  const logs = readJsonLines<LogRecord>("logs")
  if (logs.length === 0) {
    console.log("No calls recorded yet in .maskea/logs.jsonl.")
    return
  }

  const recent = logs.slice(-limit).reverse()
  console.log(`${pc.bold("maskea inspect")} — last ${recent.length} of ${logs.length} call(s)\n`)

  for (const r of recent) {
    const status = r.ok ? pc.green("✓") : pc.red("✗")
    const time = new Date(r.timestamp).toLocaleTimeString()
    const attemptStr = r.attempt > 1 ? ` (attempt ${r.attempt})` : ""
    console.log(`${status} ${time}  ${r.durationMs}ms${attemptStr}  ${r.callId.slice(0, 8)}`)
    if (r.error) console.log(`   ${pc.red("error:")} ${r.error}`)
    if (r.secretHits?.length) console.log(`   ${pc.yellow("secrets redacted:")} ${r.secretHits.map((h) => `${h.rule}×${h.count}`).join(", ")}`)
    if (r.piiHits?.length) console.log(`   ${pc.yellow("PII redacted:")} ${r.piiHits.map((h) => `${h.rule}×${h.count}`).join(", ")}`)
  }
}
