// Customer Failure Laboratory (task #52): cloud-sync.ts implements the
// SDK's hard boundary ("the SDK must never require a network call to a
// Maskea server to function", cloud-architecture.md §1) but had zero direct
// tests -- nothing pinned that a Cloud outage/misconfiguration is actually
// silent-degrade rather than a thrown error reaching the developer's call.
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest"
import { cloudSync } from "./cloud-sync.js"
import type { MaskeaContext } from "../types.js"

function makeCtx(overrides: Partial<MaskeaContext> = {}): MaskeaContext {
  return {
    callId: "call-1",
    attempt: 1,
    startedAt: Date.now(),
    meta: {},
    ...overrides,
  } as MaskeaContext
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe("cloudSync -- must never require Cloud to function", () => {
  it("still returns the wrapped call's real result when no API key is configured at all (no cloud link, no explicit apiKey)", async () => {
    const mw = cloudSync({})
    const next = vi.fn().mockResolvedValue("real-result")
    const result = await mw([], next, makeCtx())
    expect(result).toBe("real-result")
  })

  it("never calls fetch when unconfigured -- confirms it's a true no-op, not just a swallowed error", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch")
    const mw = cloudSync({})
    await mw([], vi.fn().mockResolvedValue("ok"), makeCtx())
    // Advance past the flush interval too -- still nothing to send.
    await vi.advanceTimersByTimeAsync(60000)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it("still propagates the wrapped call's own error even when Cloud is unreachable -- sync failure must never mask a real error from the developer's actual call", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("ECONNREFUSED"))
    const mw = cloudSync({ apiKey: "kzk_test" })
    const next = vi.fn().mockRejectedValue(new Error("real provider error"))
    await expect(mw([], next, makeCtx())).rejects.toThrow("real provider error")
  })

  it("silently degrades when the Cloud sync endpoint is unreachable -- flush must not throw or reject", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network down"))
    const mw = cloudSync({ apiKey: "kzk_test", maxBufferSize: 1 })
    // maxBufferSize: 1 triggers an immediate flush attempt inside the call.
    await expect(mw([], vi.fn().mockResolvedValue("ok"), makeCtx())).resolves.toBe("ok")
  })

  it("silently degrades on the interval-triggered flush too, not just the buffer-triggered one", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network down"))
    const mw = cloudSync({ apiKey: "kzk_test", flushIntervalMs: 1000 })
    await mw([], vi.fn().mockResolvedValue("ok"), makeCtx())
    // Should not throw / crash the process on the timer tick -- an
    // unhandled rejection here would fail this test on its own.
    await vi.advanceTimersByTimeAsync(1000)
  })

  it("batches into a single POST once the buffer reaches maxBufferSize, not one request per call", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }))
    const mw = cloudSync({ apiKey: "kzk_test", maxBufferSize: 3 })
    await mw([], vi.fn().mockResolvedValue("ok"), makeCtx({ callId: "1" }))
    await mw([], vi.fn().mockResolvedValue("ok"), makeCtx({ callId: "2" }))
    expect(fetchSpy).not.toHaveBeenCalled() // below threshold
    await mw([], vi.fn().mockResolvedValue("ok"), makeCtx({ callId: "3" }))
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const body = JSON.parse((fetchSpy.mock.calls[0]![1] as RequestInit).body as string)
    expect(body.calls).toHaveLength(3)
  })
})
