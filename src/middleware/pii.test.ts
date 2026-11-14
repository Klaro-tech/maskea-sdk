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
})
