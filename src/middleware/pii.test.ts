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
})
