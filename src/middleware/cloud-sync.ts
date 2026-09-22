// Maskea Cloud sync middleware -- the only new SDK-side code Cloud
// requires per cloud-architecture.md's build order step 2. Additive:
// buffers each call's real record (same shape logging()/budget() already
// write locally) and pushes it to Cloud on an interval, batched,
// non-blocking. Never required for the SDK to function -- the hard
// boundary from cloud-architecture.md §1: "the SDK must never require a
// network call to a Maskea server to function."
import type { Middleware } from "../types.js"
import { readJson } from "../storage/local-store.js"

export interface CloudSyncOptions {
  /** Project API key from `maskea cloud link` (read from .maskea/cloud.json if omitted) or CI's own env var -- see docs. */
  apiKey?: string
  apiBaseUrl?: string
  /** How often to flush the buffer, in ms. Default 30000 (30s) -- matches cloud-architecture.md §5's stated default. */
  flushIntervalMs?: number
  /** Flush early if the buffer grows past this many records, so a burst of calls doesn't wait a full interval. */
  maxBufferSize?: number
}

interface CloudCallRecord {
  callId: string
  attempt: number
  durationMs: number
  ok: boolean
  error?: string
  secretHits?: unknown
  piiHits?: unknown
  timestamp: string
}
interface CloudSpendRecord {
  model: string
  costUsd: number
  timestamp: string
}

interface CloudLinkConfig {
  projectKey?: string
}

const DEFAULT_API_BASE_URL = "https://maskea.services"

export function cloudSync(options: CloudSyncOptions = {}): Middleware {
  const apiBaseUrl = (options.apiBaseUrl ?? DEFAULT_API_BASE_URL).replace(/\/+$/, "")
  const flushIntervalMs = options.flushIntervalMs ?? 30000
  const maxBufferSize = options.maxBufferSize ?? 50

  let apiKey = options.apiKey
  if (!apiKey) {
    const linked = readJson<CloudLinkConfig>("cloud", {})
    apiKey = linked.projectKey
  }

  const callBuffer: CloudCallRecord[] = []
  const spendBuffer: CloudSpendRecord[] = []

  // Fire-and-forget, silent-degrade on failure -- exactly the same
  // non-blocking discipline the local middleware already uses for its
  // own internal failures (cloud-architecture.md §5). A sync outage must
  // never surface to the developer's actual AI call.
  async function flush(): Promise<void> {
    if (!apiKey) return
    if (callBuffer.length === 0 && spendBuffer.length === 0) return

    const calls = callBuffer.splice(0, callBuffer.length)
    const spend = spendBuffer.splice(0, spendBuffer.length)

    try {
      await fetch(`${apiBaseUrl}/api/maskea/cloud/sync`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": apiKey },
        body: JSON.stringify({ calls, spend }),
        signal: AbortSignal.timeout(10000),
      })
    } catch {
      // Sync failure is silent-degrade, logged locally, never thrown --
      // cloud-architecture.md §5. Nothing to do here; the records are
      // already dropped from the buffer rather than retried indefinitely
      // (an unbounded retry queue is its own failure mode under a
      // sustained outage), matching the "next successful flush just
      // covers whatever's recorded since then" model.
    }
  }

  // unref() so this timer never keeps a short-lived script/CLI process
  // alive on its own -- same principle as the hard boundary in §1: Cloud
  // sync must never change how the SDK behaves for someone not using it.
  const timer = setInterval(() => { void flush() }, flushIntervalMs)
  timer.unref?.()

  return async (args, next, ctx) => {
    try {
      const result = await next(args)
      callBuffer.push({
        callId: ctx.callId,
        attempt: ctx.attempt,
        durationMs: Date.now() - ctx.startedAt,
        ok: true,
        secretHits: ctx.meta.secretHits,
        piiHits: ctx.meta.piiHits,
        timestamp: new Date().toISOString(),
      })
      // Only present if budget() ran earlier in the chain and the
      // provider's response included usage this call's pricing table
      // recognized -- same "not every call has spend data" reality
      // budget() itself already documents.
      if (typeof ctx.meta.costUsd === "number" && typeof ctx.meta.model === "string") {
        spendBuffer.push({ model: ctx.meta.model, costUsd: ctx.meta.costUsd, timestamp: new Date().toISOString() })
      }
      if (callBuffer.length + spendBuffer.length >= maxBufferSize) void flush()
      return result
    } catch (error) {
      callBuffer.push({
        callId: ctx.callId,
        attempt: ctx.attempt,
        durationMs: Date.now() - ctx.startedAt,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
        secretHits: ctx.meta.secretHits,
        piiHits: ctx.meta.piiHits,
        timestamp: new Date().toISOString(),
      })
      if (callBuffer.length + spendBuffer.length >= maxBufferSize) void flush()
      throw error
    }
  }
}
