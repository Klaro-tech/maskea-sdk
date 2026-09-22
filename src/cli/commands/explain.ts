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

/**
 * Narrates a call's full attempt history, most recent call by default (or
 * a specific one by callId / its 8-char prefix, matching what `maskea
 * inspect` prints). retries() sits OUTSIDE logging() in the recommended
 * pipeline order, so a retried call's inner chain -- including logging()
 * -- runs once per attempt, meaning multiple records share one callId,
 * one per attempt. This groups them back into the single story the
 * brief's mockup shows (retry triggered -> 429 -> waited -> success)
 * instead of just reporting the final outcome in isolation.
 */
export function explain(callIdPrefix?: string): void {
  const logs = readJsonLines<LogRecord>("logs")
  if (logs.length === 0) {
    console.log("No calls recorded yet in .maskea/logs.jsonl.")
    return
  }

  const targetId = callIdPrefix
    ? logs.find((l) => l.callId.startsWith(callIdPrefix))?.callId
    : logs[logs.length - 1]?.callId

  if (!targetId) {
    console.log(`No call found matching "${callIdPrefix}". Run \`maskea inspect\` to see recent call ids.`)
    return
  }

  const attempts = logs.filter((l) => l.callId === targetId).sort((a, b) => a.attempt - b.attempt)
  const final = attempts[attempts.length - 1]

  console.log(`${pc.bold("maskea explain")} — call ${targetId.slice(0, 8)} (${new Date(final.timestamp).toLocaleString()})\n`)

  const steps: string[] = []

  for (let i = 0; i < attempts.length; i++) {
    const a = attempts[i]
    if (i > 0) {
      steps.push(`Retry triggered — attempt ${a.attempt}`)
    }
    if (a.secretHits?.length) {
      const total = a.secretHits.reduce((s, h) => s + h.count, 0)
      steps.push(`Secrets removed — ${total} match${total === 1 ? "" : "es"} (${a.secretHits.map((h) => h.rule).join(", ")}) redacted before the call went out`)
    }
    if (a.piiHits?.length) {
      const total = a.piiHits.reduce((s, h) => s + h.count, 0)
      steps.push(`PII removed — ${total} match${total === 1 ? "" : "es"} (${a.piiHits.map((h) => h.rule).join(", ")}) redacted before the call went out`)
    }
    if (!a.ok) {
      steps.push(`Failed after ${a.durationMs}ms — ${a.error ?? "unknown error"}`)
    } else {
      steps.push(`Succeeded in ${a.durationMs}ms`)
    }
  }

  steps.forEach((step, i) => {
    console.log(`  ${step}`)
    if (i < steps.length - 1) console.log("  ↓")
  })

  if (attempts.length > 1) {
    const totalMs = attempts.reduce((sum, a) => sum + a.durationMs, 0)
    console.log(`\n${attempts.length} attempts, ${totalMs}ms total, ${final.ok ? pc.green("succeeded") : pc.red("failed")} in the end.`)
  }

  if (!final.ok) {
    console.log(`\n${pc.red("No successful attempt.")} Check retries({ max }) if this call should retry further, or the error above for what the provider actually said.`)
  }
}
