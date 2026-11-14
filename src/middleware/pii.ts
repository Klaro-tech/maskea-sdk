import type { Middleware } from "../types.js"
import { deepRedact, type RedactionRule } from "./redact-utils.js"
import { sendTelemetry } from "../telemetry/send.js"

export type PiiType = "email" | "phone" | "ssn" | "credit_card" | "aadhaar" | "pan" | "gstin" | "ifsc" | "upi" | "in_phone"

// Types that are only scanned when asked for by name: they match formats that also occur in ordinary text, so turning them on
// silently for everyone would change what existing users see.
const OPT_IN: PiiType[] = ["aadhaar", "pan", "gstin", "ifsc", "upi", "in_phone"]

export interface PiiOptions {
  mode?: "mask" | "block"
  /** Which PII types to scan for. Default: email, phone, ssn, credit_card. Add the India types "aadhaar", "pan", "gstin", "ifsc", "upi" and "in_phone" by name. */
  types?: PiiType[]
}

// Verhoeff check-digit scheme, used by Aadhaar. A real Aadhaar always passes; most random 12-digit groups do not.
const VERHOEFF_D = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 2, 3, 4, 0, 6, 7, 8, 9, 5], [2, 3, 4, 0, 1, 7, 8, 9, 5, 6], [3, 4, 0, 1, 2, 8, 9, 5, 6, 7], [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 9, 8, 7, 6, 0, 4, 3, 2, 1], [6, 5, 9, 8, 7, 1, 0, 4, 3, 2], [7, 6, 5, 9, 8, 2, 1, 0, 4, 3], [8, 7, 6, 5, 9, 3, 2, 1, 0, 4], [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
]
const VERHOEFF_P = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 5, 7, 6, 2, 8, 3, 0, 9, 4], [5, 8, 0, 3, 7, 9, 6, 1, 4, 2], [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0], [4, 2, 8, 6, 5, 7, 3, 9, 0, 1], [2, 7, 9, 3, 8, 0, 6, 4, 1, 5], [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
]
export function verhoeffValid(digits: string): boolean {
  let c = 0
  const rev = digits.split("").reverse()
  for (let i = 0; i < rev.length; i++) c = VERHOEFF_D[c]![VERHOEFF_P[i % 8]![Number(rev[i])]!]!
  return c === 0
}

// GSTIN check character: mod-36 over the first 14 characters (weights 1,2,1,2,...).
const GSTIN_CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"
export function gstinValid(gstin: string): boolean {
  let sum = 0
  for (let i = 0; i < 14; i++) {
    const v = GSTIN_CHARS.indexOf(gstin[i]!)
    if (v < 0) return false
    const product = v * (i % 2 === 0 ? 1 : 2)
    sum += Math.floor(product / 36) + (product % 36)
  }
  return GSTIN_CHARS[(36 - (sum % 36)) % 36] === gstin[14]
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
  // matched (too many order and phone numbers); the Verhoeff check digit is verified, so a group of four-four-four digits that is not a valid Aadhaar is left alone.
  aadhaar: {
    name: "aadhaar",
    pattern: /(?<![\d-])[2-9]\d{3}[-\s]\d{4}[-\s]\d{4}(?![-\s]?\d)/g,
    replacement: "[REDACTED_AADHAAR]",
    validate: (m) => verhoeffValid(m.replace(/\D/g, "")),
  },
  // PAN: five letters, four digits, one letter (e.g. ABCDE1234F); the fourth letter encodes the holder type.
  pan: { name: "pan", pattern: /\b[A-Z]{3}[ABCFGHLJPT][A-Z]\d{4}[A-Z]\b/g, replacement: "[REDACTED_PAN]" },
  // GSTIN: state code (2 digits), the holder's PAN, entity number, "Z", check character (verified).
  gstin: { name: "gstin", pattern: /\b\d{2}[A-Z]{3}[ABCFGHLJPT][A-Z]\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]\b/g, replacement: "[REDACTED_GSTIN]", validate: gstinValid },
  // IFSC: four bank letters, a zero, six branch characters (e.g. HDFC0001234). Identifies a branch, not a person; opt-in for payment text.
  ifsc: { name: "ifsc", pattern: /\b[A-Z]{4}0[A-Z0-9]{6}\b/g, replacement: "[REDACTED_IFSC]" },
  // UPI ID: handle@psp, limited to the common handle suffixes so ordinary "name@word" text is not matched.
  upi: {
    name: "upi",
    pattern: /\b[A-Za-z0-9._-]{2,64}@(?:ok(?:axis|hdfcbank|icici|sbi)|ybl|ibl|axl|paytm|apl|upi|sbi|icici|hdfcbank|axisbank|pnb|barodampay|fbl|ikwik|airtel|jio|postbank|freecharge|ezetap)\b/gi,
    replacement: "[REDACTED_UPI]",
  },
  // Indian mobile numbers: optional +91 / 91 / 0, then ten digits starting 6-9, with an optional single space or hyphen after five digits.
  in_phone: { name: "in_phone", pattern: /(?<![\d-])(?:\+91[-\s]?|91[-\s]?|0)?[6-9]\d{4}[-\s]?\d{5}(?![-\s]?\d)/g, replacement: "[REDACTED_PHONE_IN]" },
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
