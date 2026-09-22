import pc from "picocolors"
import type { Middleware } from "../types.js"
import { appendJsonLine } from "../storage/local-store.js"

export interface LoggingOptions {
  format?: "pretty" | "json" | "silent"
}

interface LogRecord {
  callId: string
  attempt: number
  durationMs: number
  ok: boolean
  error?: string
  secretHits?: unknown
  piiHits?: unknown
  timestamp: string
}

export function logging(options: LoggingOptions = {}): Middleware {
  const format = options.format ?? "pretty"

  return async (args, next, ctx) => {
    try {
      const result = await next(args)
      writeLog({
        callId: ctx.callId,
        attempt: ctx.attempt,
        durationMs: Date.now() - ctx.startedAt,
        ok: true,
        secretHits: ctx.meta.secretHits,
        piiHits: ctx.meta.piiHits,
        timestamp: new Date().toISOString(),
      }, format)
      return result
    } catch (error) {
      writeLog({
        callId: ctx.callId,
        attempt: ctx.attempt,
        durationMs: Date.now() - ctx.startedAt,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
        secretHits: ctx.meta.secretHits,
        piiHits: ctx.meta.piiHits,
        timestamp: new Date().toISOString(),
      }, format)
      throw error
    }
  }
}

function writeLog(record: LogRecord, format: "pretty" | "json" | "silent"): void {
  // Persisted regardless of display format -- `maskea inspect`/`maskea stats`
  // read this file, so logging({format: 'silent'}) means "don't print to
  // stdout," not "don't record anything."
  appendJsonLine("logs", record)

  if (format === "silent") return
  if (format === "json") {
    console.log(JSON.stringify(record))
    return
  }

  const status = record.ok ? pc.green("✓") : pc.red("✗")
  const flags: string[] = []
  if (record.secretHits) flags.push(pc.yellow("secrets redacted"))
  if (record.piiHits) flags.push(pc.yellow("PII redacted"))
  const flagStr = flags.length ? ` [${flags.join(", ")}]` : ""
  const attemptStr = record.attempt > 1 ? ` (attempt ${record.attempt})` : ""
  console.log(`${pc.dim("[maskea]")} ${status} ${record.durationMs}ms${attemptStr}${flagStr}${record.error ? ` ${pc.red(`— ${record.error}`)}` : ""}`)
}
