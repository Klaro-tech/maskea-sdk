import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { rmSync, existsSync } from "node:fs"
import { Maskea } from "./maskea.js"
import { retries } from "./middleware/retries.js"
import { secrets } from "./middleware/secrets.js"
import { pii } from "./middleware/pii.js"
import { budget } from "./middleware/budget.js"
import { logging } from "./middleware/logging.js"
import { readJsonLines, readJson } from "./storage/local-store.js"

const KLARO_DIR = new URL("../.maskea", import.meta.url).pathname

beforeEach(() => {
  if (existsSync(KLARO_DIR)) rmSync(KLARO_DIR, { recursive: true, force: true })
})
afterEach(() => {
  if (existsSync(KLARO_DIR)) rmSync(KLARO_DIR, { recursive: true, force: true })
})

describe("Maskea middleware pipeline", () => {
  it("runs a simple call through the chain unmodified when nothing triggers", async () => {
    const maskea = new Maskea().use(logging({ format: "silent" }))
    const wrapped = maskea.wrap(async (name: string) => `hello ${name}`)
    const result = await wrapped("world")
    expect(result).toBe("hello world")
  })

  it("retries on a retryable error and eventually succeeds", async () => {
    let attempts = 0
    const maskea = new Maskea().use(retries({ max: 3, baseDelayMs: 1 }))
    const wrapped = maskea.wrap(async () => {
      attempts++
      if (attempts < 3) {
        const err: any = new Error("rate limited")
        err.status = 429
        throw err
      }
      return "ok"
    })
    const result = await wrapped()
    expect(result).toBe("ok")
    expect(attempts).toBe(3)
  })

  it("does not retry a non-retryable error", async () => {
    let attempts = 0
    const maskea = new Maskea().use(retries({ max: 3, baseDelayMs: 1 }))
    const wrapped = maskea.wrap(async () => {
      attempts++
      const err: any = new Error("bad request")
      err.status = 400
      throw err
    })
    await expect(wrapped()).rejects.toThrow("bad request")
    expect(attempts).toBe(1)
  })

  it("redacts a secret from the args before the call runs", async () => {
    let seenArgs: unknown
    const maskea = new Maskea().use(secrets())
    const wrapped = maskea.wrap(async (messages: { role: string; content: string }[]) => {
      seenArgs = messages
      return "response"
    })
    await wrapped([{ role: "user", content: "my key is sk-proj-abcdefghijklmnopqrstuvwxyz1234567890" }])
    expect((seenArgs as any)[0].content).toContain("[REDACTED_OPENAI_KEY]")
    expect((seenArgs as any)[0].content).not.toContain("sk-proj-abcdefghijklmnopqrstuvwxyz")
  })

  it("blocks a call when secrets mode is 'block'", async () => {
    const maskea = new Maskea().use(secrets({ mode: "block" }))
    const wrapped = maskea.wrap(async (s: string) => s)
    await expect(wrapped("sk-proj-abcdefghijklmnopqrstuvwxyz1234567890")).rejects.toThrow(/Blocked call/)
  })

  it("redacts PII (email) from args", async () => {
    let seenArgs: unknown
    const maskea = new Maskea().use(pii({ types: ["email"] }))
    const wrapped = maskea.wrap(async (s: string) => {
      seenArgs = s
      return "ok"
    })
    await wrapped("contact me at jane@example.com please")
    expect(seenArgs).toBe("contact me at [REDACTED_EMAIL] please")
  })

  it("records estimated cost from OpenAI-shaped usage and persists it locally", async () => {
    const maskea = new Maskea().use(budget({ maxMonthlyUsd: 1000 }))
    const wrapped = maskea.wrap(async () => ({
      model: "gpt-4o-mini",
      usage: { prompt_tokens: 1000, completion_tokens: 500 },
    }))
    await wrapped()
    const spend = readJsonLines<{ costUsd: number; model?: string }>("budget")
    expect(spend.length).toBe(1)
    expect(spend[0].costUsd).toBeGreaterThan(0)
    // Real regression coverage for a bug caught while building the AI
    // Doctor cost-recommendation feature: budget() persisted costUsd but
    // silently dropped the model field, so anything reading .maskea/budget
    // to recommend a cheaper model would never find one in real usage.
    expect(spend[0].model).toBe("gpt-4o-mini")
  })

  it("persists the configured budget cap for other tools (e.g. the CLI) to read", async () => {
    new Maskea().use(budget({ maxMonthlyUsd: 42 }))
    const config = readJson<{ maxMonthlyUsd: number }>("budget-config", { maxMonthlyUsd: 0 })
    expect(config.maxMonthlyUsd).toBe(42)
  })

  it("throws once monthly spend exceeds the cap", async () => {
    const maskea = new Maskea().use(budget({ maxMonthlyUsd: 0.0001 }))
    const wrapped = maskea.wrap(async () => ({
      model: "gpt-4o",
      usage: { prompt_tokens: 100000, completion_tokens: 100000 },
    }))
    await wrapped() // first call always allowed (nothing spent yet to check against)
    await expect(wrapped()).rejects.toThrow(/budget exceeded/)
  })

  it("composes multiple middleware in the right order (outermost .use() sees the call first)", async () => {
    const order: string[] = []
    const maskea = new Maskea()
      .use(async (args, next) => {
        order.push("a-before")
        const r = await next(args)
        order.push("a-after")
        return r
      })
      .use(async (args, next) => {
        order.push("b-before")
        const r = await next(args)
        order.push("b-after")
        return r
      })
    const wrapped = maskea.wrap(async () => {
      order.push("call")
      return "done"
    })
    await wrapped()
    expect(order).toEqual(["a-before", "b-before", "call", "b-after", "a-after"])
  })
})
