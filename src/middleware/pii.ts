import type { Middleware } from "../types.js"
import { deepRedact, type RedactionRule } from "./redact-utils.js"
import { sendTelemetry } from "../telemetry/send.js"

export type PiiType = "email" | "phone" | "ssn" | "credit_card" | "aadhaar" | "pan"

// Types that are only scanned when asked for by name: they match formats that also occur in ordinary text, so turning them on
// silently for everyone would change what existing users see.
const OPT_IN: PiiType[] = ["aadhaar", "pan"]

export interface PiiOptions {
  mode?: "mask" | "block"
  /** Which PII types to scan for. Default: email, phone, ssn, credit_card. Add "aadhaar" and "pan" (India) by name. */
  types?: PiiType[]
}

const PII_RULES: Record<PiiType, RedactionRule> = {
  email: { name: "email", pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, replacement: "[REDACTED_EMAIL]" },
  // US format specifically (###-###-####, optional country code/parens) --
  // international phone formats are too structurally varied to match
  // without a much higher false-positive rate on ordinary numbers in text.
  phone: { name: "phone", pattern: /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}\b/g, replacement: "[REDACTED_PHONE]" },
  ssn: { name: "ssn", pattern: /\b\d{3}-\d{2}-\d{4}\b/g, replacement: "[REDACTED_SSN]" },
  // Matches major card issuers' real prefix+length rules (Visa/Mastercard/
  // Amex/Discover), not just "16 digits in a row" -- cuts down on
  // false-positives against order IDs, tracking numbers, etc.
  credit_card: {
    name: "credit_card",
    pattern: /\b(?:4\d{3}|5[1-5]\d{2}|3[47]\d{2}|6011)[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{1,4}\b/g,
    replacement: "[REDACTED_CARD]",
  },
  // India. Aadhaar: 12 digits, first digit 2-9, written in groups of four (spaces or hyphens). Contiguous 12-digit numbers are not
  // matched (too many order and phone numbers); the Verhoeff check digit is not verified.
  aadhaar: { name: "aadhaar", pattern: /(?<![\d-])[2-9]\d{3}[-\s]\d{4}[-\s]\d{4}(?![-\s]?\d)/g, replacement: "[REDACTED_AADHAAR]" },
  // PAN: five letters, four digits, one letter (e.g. ABCDE1234F); the fourth letter encodes the holder type.
  pan: { name: "pan", pattern: /\b[A-Z]{3}[ABCFGHLJPT][A-Z]\d{4}[A-Z]\b/g, replacement: "[REDACTED_PAN]" },
}

export function pii(options: PiiOptions = {}): Middleware {
  sendTelemetry("middleware_pii_enabled")
  const mode = options.mode ?? "mask"
  const types = options.types ?? (Object.keys(PII_RULES) as PiiType[]).filter((t) => !OPT_IN.includes(t))
  const rules = types.map((t) => PII_RULES[t])

  return async (args, next, ctx) => {
    const { value, hits } = deepRedact(args, rules)
    if (hits.length > 0) {
      ctx.meta.piiHits = hits
      if (mode === "block") {
        throw new Error(
          `[maskea] Blocked call: PII detected in the request (${hits.map((h) => `${h.rule}×${h.count}`).join(", ")}). ` +
            `Set pii({ mode: "mask" }) to redact instead of blocking.`
        )
      }
    }

    const result = await next(value as typeof args)

    // The provider's response can carry PII too -- it may echo the
    // caller's own input back, or (rarely) surface something the model
    // picked up elsewhere. Scanning only the outbound request left this
    // half of the round trip completely unprotected, which is exactly
    // what a "PII redaction" middleware exists to prevent.
    const { value: redactedResult, hits: responseHits } = deepRedact(result, rules)
    if (responseHits.length > 0) {
      ctx.meta.piiHitsResponse = responseHits
      if (mode === "block") {
        throw new Error(
          `[maskea] Blocked call: PII detected in the provider's response (${responseHits.map((h) => `${h.rule}×${h.count}`).join(", ")}). ` +
            `Set pii({ mode: "mask" }) to redact instead of blocking.`
        )
      }
    }
    return redactedResult
  }
}
