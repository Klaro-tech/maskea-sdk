import { describe, it, expect } from "vitest"
import { Maskea } from "../maskea.js"
import { pii } from "./pii.js"

describe("pii middleware", () => {
  it("redacts PII in the outbound request", async () => {
    const maskea = new Maskea().use(pii({ mode: "mask" }))
    const wrapped = maskea.wrap(async (arg: { text: string }) => ({ echo: arg.text }))
    const result = await wrapped({ text: "email me at jane@example.com" })
    expect(result.echo).not.toContain("jane@example.com")
    expect(result.echo).toContain("[REDACTED_EMAIL]")
  })

  it("redacts PII in the provider's response, not just the request", async () => {
    const maskea = new Maskea().use(pii({ mode: "mask" }))
    // Provider echoes PII back in its response that was never present in
    // the outbound request -- request-only scanning would miss this.
    const wrapped = maskea.wrap(async () => ({
      choices: [{ message: { content: "Sure, contact john@example.com, card 4242-4242-4242-4242" } }],
    }))
    const result = await wrapped()
    const text = result.choices[0].message.content
    expect(text).not.toContain("john@example.com")
    expect(text).not.toContain("4242-4242-4242-4242")
    expect(text).toContain("[REDACTED_EMAIL]")
    expect(text).toContain("[REDACTED_CARD]")
  })

  it("block mode throws on PII found in the response", async () => {
    const maskea = new Maskea().use(pii({ mode: "block" }))
    const wrapped = maskea.wrap(async () => ({ text: "ssn 123-45-6789" }))
    await expect(wrapped()).rejects.toThrow(/PII detected in the provider's response/)
  })

  it("India identifiers are off by default and redacted when asked for", async () => {
    const text = "Aadhaar 2345 6789 0124, PAN ABCPE1234F"
    const off = new Maskea().use(pii({ mode: "mask" }))
    const r1 = await off.wrap(async (a: { text: string }) => ({ echo: a.text }))({ text })
    expect(r1.echo).toContain("2345 6789 0124")
    const on = new Maskea().use(pii({ mode: "mask", types: ["aadhaar", "pan"] }))
    const r2 = await on.wrap(async (a: { text: string }) => ({ echo: a.text }))({ text })
    expect(r2.echo).not.toContain("2345 6789 0124")
    expect(r2.echo).not.toContain("ABCPE1234F")
    expect(r2.echo).toContain("[REDACTED_AADHAAR]")
    expect(r2.echo).toContain("[REDACTED_PAN]")
  })

  it("Aadhaar needs a valid check digit, so look-alike groups are left alone", async () => {
    const on = new Maskea().use(pii({ mode: "mask", types: ["aadhaar"] }))
    const r = await on.wrap(async (a: { text: string }) => ({ echo: a.text }))({ text: "real 2345 6789 0124 fake 2345 6789 0123" })
    expect(r.echo).toContain("[REDACTED_AADHAAR]")
    expect(r.echo).toContain("2345 6789 0123")
    expect(r.echo).not.toContain("2345 6789 0124")
  })

  it("redacts GSTIN (checksum verified), IFSC, UPI IDs and Indian mobile numbers when asked for", async () => {
    const text = "GSTIN 27ABCPE1234F1ZB bad 27ABCPE1234F1ZC, IFSC HDFC0001234, pay vikram.k@okaxis or 98765 43210 or +91 9876543210 or mail a@example.com"
    const on = new Maskea().use(pii({ mode: "mask", types: ["gstin", "ifsc", "upi", "in_phone"] }))
    const r = await on.wrap(async (a: { text: string }) => ({ echo: a.text }))({ text })
    expect(r.echo).toContain("[REDACTED_GSTIN]")
    expect(r.echo).toContain("27ABCPE1234F1ZC") // wrong check character: not a GSTIN
    expect(r.echo).toContain("[REDACTED_IFSC]")
    expect(r.echo).toContain("[REDACTED_UPI]")
    expect(r.echo).not.toContain("okaxis")
    expect(r.echo).toContain("[REDACTED_PHONE_IN]")
    expect(r.echo).not.toContain("98765 43210")
    expect(r.echo).not.toContain("9876543210")
    expect(r.echo).toContain("a@example.com") // ordinary email untouched by these types
    const off = new Maskea().use(pii({ mode: "mask" }))
    const r2 = await off.wrap(async (a: { text: string }) => ({ echo: a.text }))({ text })
    expect(r2.echo).toContain("HDFC0001234")
  })

  it("credit cards need a valid Luhn check digit and the American Express 4-6-5 layout is covered", async () => {
    const m = new Maskea().use(pii({ mode: "mask" }))
    const run = (text: string) => m.wrap(async (a: { text: string }) => ({ echo: a.text }))({ text })
    const valid = await run("visa 4111 1111 1111 1111 amex 3782 822463 10005")
    expect(valid.echo).toBe("visa [REDACTED_CARD] amex [REDACTED_CARD]")
    const look = await run("tracking 4111 1111 1111 1112")
    expect(look.echo).toContain("4111 1111 1111 1112")
  })

  it("name and address are opt-in and rule-based: titles, labels, known full names, street addresses", async () => {
    const run = async (text: string, types: Array<"name" | "address">) =>
      (await new Maskea().use(pii({ mode: "mask", types })).wrap(async (a: { text: string }) => ({ echo: a.text }))({ text })).echo
    expect(await run("Dr. Zubin Mehta reviewed it", ["name"])).toBe("Dr. [REDACTED_NAME] reviewed it")
    expect(await run("Patient: Nandini Rao, ward 4", ["name"])).toBe("Patient: [REDACTED_NAME], ward 4")
    expect(await run("Assign to Priya Sharma today", ["name"])).toBe("Assign to [REDACTED_NAME] today")
    expect(await run("Please Mark Down the Meeting Notes from Monday", ["name"])).toBe("Please Mark Down the Meeting Notes from Monday")
    expect(await run("Mark Smith joined", ["name"])).toBe("[REDACTED_NAME] joined") // ambiguous first name, but a known surname
    expect(await run("Ship to 221 Baker Street, London now", ["address"])).toBe("Ship to [REDACTED_ADDRESS] now")
    expect(await run("Flat 12 MG Road, Bengaluru. PIN 560001", ["address"])).toBe("Flat [REDACTED_ADDRESS]. PIN [REDACTED_ADDRESS]")
    expect(await run("I live in London", ["address"])).toBe("I live in London") // a bare city is not matched
    const off = await new Maskea().use(pii({ mode: "mask" })).wrap(async (a: { text: string }) => ({ echo: a.text }))({ text: "Priya Sharma, 221 Baker Street" })
    expect(off.echo).toBe("Priya Sharma, 221 Baker Street")
  })

  it("custom detectors can mask spans the built-in rules do not know, in requests and responses", async () => {
    const find = (word: string) => (text: string) => {
      const i = text.indexOf(word)
      return i < 0 ? [] : [{ start: i, end: i + word.length, label: "person" }]
    }
    const m = new Maskea().use(pii({ mode: "mask", detectors: [find("Ojas Pandit")] }))
    const seen: string[] = []
    const out = await m.wrap(async (a: { text: string }) => { seen.push(a.text); return { echo: "reply about Ojas Pandit" } })({ text: "Hello Ojas Pandit, mail a@b.co" })
    expect(seen[0]).toBe("Hello [REDACTED_PERSON], mail [REDACTED_EMAIL]")
    expect(out.echo).toBe("reply about [REDACTED_PERSON]")
  })

  it("a failing custom detector stops the call by default, or is skipped when asked", async () => {
    const boom = () => { throw new Error("model offline") }
    const strict = new Maskea().use(pii({ detectors: [boom] }))
    await expect(strict.wrap(async (a: { text: string }) => a)({ text: "hi" })).rejects.toThrow(/custom PII detector failed/)
    const lenient = new Maskea().use(pii({ detectors: [boom], onDetectorError: "skip" }))
    expect((await lenient.wrap(async (a: { text: string }) => a)({ text: "hi" })).text).toBe("hi")
  })

  it("overlapping custom spans are merged and out-of-range spans are ignored", async () => {
    const d = (t: string) => (t.startsWith("abc") ? [{ start: 0, end: 5 }, { start: 3, end: 8 }, { start: 50, end: 60 }, { start: -1, end: 2 }] : [])
    const out = await new Maskea().use(pii({ detectors: [d] })).wrap(async (a: { text: string }) => a)({ text: "abcdefghij" })
    expect(out.text).toBe("[REDACTED_CUSTOM]fghij")
  })
})
