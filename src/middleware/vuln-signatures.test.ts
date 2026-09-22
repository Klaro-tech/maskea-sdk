import { describe, it, expect } from "vitest"
import { Maskea } from "../maskea.js"
import { vulnSignatures } from "./vuln-signatures.js"
import { deepRedact, type RedactionRule } from "./redact-utils.js"

describe("vulnSignatures middleware", () => {
  it("flags a known-vulnerable log4j-core version in the outbound request WITHOUT altering the text", async () => {
    const maskea = new Maskea().use(vulnSignatures())
    const wrapped = maskea.wrap(async (arg: { text: string }) => {
      // the whole point of "flag" -- the vulnerable string must still be
      // present for the wrapped call to see, not redacted away.
      expect(arg.text).toContain("log4j-core:2.14.1")
      return { echo: arg.text }
    })
    const result = await wrapped({ text: "we use log4j-core:2.14.1 in this service" })
    expect(result.echo).toContain("log4j-core:2.14.1")
  })

  it("flags a vulnerable signature in the provider's response too", async () => {
    const maskea = new Maskea().use(vulnSignatures())
    const wrapped = maskea.wrap(async () => ({ text: "this project depends on spring-core:5.3.17" }))
    const result = await wrapped()
    expect(result.text).toContain("spring-core:5.3.17")
  })

  it("does not flag a patched version outside the vulnerable range", async () => {
    const maskea = new Maskea().use(vulnSignatures())
    const wrapped = maskea.wrap(async (arg: { text: string }) => ({ echo: arg.text }))
    const result = await wrapped({ text: "we use log4j-core:2.17.1 (patched)" })
    expect(result.echo).toContain("log4j-core:2.17.1")
  })
})

describe("deepRedact: action:'flag' behavior (shared with pii/secrets rules)", () => {
  it("leaves matched text intact for a flag rule while still recording the match", () => {
    const rules: RedactionRule[] = [{ name: "test_flag", pattern: /VULN-\d+/g, replacement: "[SHOULD_NOT_APPEAR]", action: "flag" }]
    const { value, hits, flagged } = deepRedact({ text: "found VULN-123 here" }, rules)
    expect(value.text).toBe("found VULN-123 here")
    expect(hits.length).toBe(0)
    expect(flagged.length).toBe(1)
    expect(flagged[0]).toEqual({ rule: "test_flag", count: 1, matches: ["VULN-123"] })
  })

  it("a redact rule (default/no action) still replaces the match as before", () => {
    const rules: RedactionRule[] = [{ name: "test_redact", pattern: /SECRET-\d+/g, replacement: "[REDACTED]" }]
    const { value, hits, flagged } = deepRedact({ text: "found SECRET-123 here" }, rules)
    expect(value.text).toBe("found [REDACTED] here")
    expect(hits).toEqual([{ rule: "test_redact", count: 1 }])
    expect(flagged.length).toBe(0)
  })
})
