export interface RedactionRule {
  name: string
  pattern: RegExp
  /** What to replace a match with -- e.g. "[REDACTED_EMAIL]". Ignored when action is "flag". */
  replacement: string
  /**
   * "redact" (default, omit this field for existing behavior): replace the
   * match with `replacement`, never persist the matched value.
   * "flag": maskea vuln-mgmt phase 3 -- record that this rule matched
   * WITHOUT altering the text. Built for vulnerable-dependency signatures
   * (e.g. a code-review call naming `lodash@4.17.15`): redacting a
   * vulnerable package name the same way a secret gets redacted would
   * destroy the exact information the customer needs to see and act on.
   * Only use "flag" for rules where the matched text itself is safe to
   * keep visible -- never for PII/secrets.
   */
  action?: "redact" | "flag"
}

export interface RedactionHit {
  rule: string
  /** Number of matches for this rule in this call, not the matched text itself -- the whole point of this middleware is to never persist the sensitive value anywhere, including in its own logs. */
  count: number
}

export interface FlaggedHit {
  rule: string
  count: number
  /**
   * The actual matched text -- safe to include here (unlike RedactionHit)
   * because a "flag" rule never redacts it; it's already visible in the
   * (unmodified) call itself, so recording it here reveals nothing new.
   */
  matches: string[]
}

/**
 * Deep-walks an arbitrary JSON-like value (works for OpenAI's messages
 * array, Anthropic's messages, a plain string prompt, or a Vercel AI SDK
 * call's options object -- whatever shape the wrapped provider call
 * happens to take) and applies every rule to every string it finds.
 * Returns a new value (never mutates the input) plus a summary of what
 * was redacted, WITHOUT the matched values themselves, plus a separate
 * summary of what was flagged (action:"flag" rules only), WITH the
 * matched values -- see FlaggedHit for why that's safe.
 */
export function deepRedact<T>(value: T, rules: RedactionRule[]): { value: T; hits: RedactionHit[]; flagged: FlaggedHit[] } {
  const hitCounts = new Map<string, number>()
  const flaggedMatches = new Map<string, string[]>()

  function redactString(s: string): string {
    let out = s
    for (const rule of rules) {
      const matches = out.match(rule.pattern)
      if (!matches || matches.length === 0) continue

      if (rule.action === "flag") {
        const existing = flaggedMatches.get(rule.name) ?? []
        flaggedMatches.set(rule.name, [...existing, ...matches])
        // Deliberately no replace() -- the whole point of "flag" is that
        // the text passes through unchanged.
        continue
      }

      hitCounts.set(rule.name, (hitCounts.get(rule.name) ?? 0) + matches.length)
      out = out.replace(rule.pattern, rule.replacement)
    }
    return out
  }

  function walk(v: unknown): unknown {
    if (typeof v === "string") return redactString(v)
    if (Array.isArray(v)) return v.map(walk)
    if (v !== null && typeof v === "object") {
      const out: Record<string, unknown> = {}
      for (const [k, val] of Object.entries(v)) out[k] = walk(val)
      return out
    }
    return v
  }

  const redacted = walk(value) as T
  const hits = Array.from(hitCounts.entries()).map(([rule, count]) => ({ rule, count }))
  const flagged = Array.from(flaggedMatches.entries()).map(([rule, matches]) => ({ rule, count: matches.length, matches }))
  return { value: redacted, hits, flagged }
}
