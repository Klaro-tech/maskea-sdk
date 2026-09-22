import type { Middleware } from "../types.js"
import { deepRedact, type RedactionRule } from "./redact-utils.js"
import { sendTelemetry } from "../telemetry/send.js"

export interface SecretsOptions {
  /** "mask" replaces matches with a placeholder before the call goes out; "block" throws instead of ever sending the call. Default "mask". */
  mode?: "mask" | "block"
}

// Deliberately narrow, high-confidence patterns only -- a secrets scanner
// with a high false-positive rate trains developers to ignore its
// warnings, which is worse than not having one. Each pattern here matches
// a real, structurally-recognizable secret format from a major provider,
// not a generic "looks like a random string" heuristic.
const SECRET_RULES: RedactionRule[] = [
  { name: "openai_api_key", pattern: /sk-(?:proj-)?[A-Za-z0-9_-]{20,}/g, replacement: "[REDACTED_OPENAI_KEY]" },
  { name: "anthropic_api_key", pattern: /sk-ant-[A-Za-z0-9_-]{20,}/g, replacement: "[REDACTED_ANTHROPIC_KEY]" },
  { name: "aws_access_key_id", pattern: /\bAKIA[0-9A-Z]{16}\b/g, replacement: "[REDACTED_AWS_KEY]" },
  { name: "github_token", pattern: /gh[pousr]_[A-Za-z0-9]{20,}/g, replacement: "[REDACTED_GITHUB_TOKEN]" },
  { name: "jwt", pattern: /\beyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, replacement: "[REDACTED_JWT]" },
  { name: "generic_bearer_token", pattern: /\bBearer\s+[A-Za-z0-9._-]{20,}\b/g, replacement: "Bearer [REDACTED_TOKEN]" },
]

export function secrets(options: SecretsOptions = {}): Middleware {
  sendTelemetry("middleware_secret_enabled")
  const mode = options.mode ?? "mask"

  return async (args, next, ctx) => {
    const { value, hits } = deepRedact(args, SECRET_RULES)
    if (hits.length > 0) {
      ctx.meta.secretHits = hits
      if (mode === "block") {
        throw new Error(
          `[maskea] Blocked call: secret(s) detected in the request (${hits.map((h) => `${h.rule}×${h.count}`).join(", ")}). ` +
            `Set secrets({ mode: "mask" }) to redact instead of blocking.`
        )
      }
    }

    const result = await next(value as typeof args)

    // A provider response can echo a secret straight back (e.g. it was
    // part of the prompt and the model repeats it, or a badly-behaved
    // provider reflects request headers/bodies in error payloads).
    // Scanning only the outbound call left that path completely open.
    const { value: redactedResult, hits: responseHits } = deepRedact(result, SECRET_RULES)
    if (responseHits.length > 0) {
      ctx.meta.secretHitsResponse = responseHits
      if (mode === "block") {
        throw new Error(
          `[maskea] Blocked call: secret(s) detected in the provider's response (${responseHits.map((h) => `${h.rule}×${h.count}`).join(", ")}). ` +
            `Set secrets({ mode: "mask" }) to redact instead of blocking.`
        )
      }
    }
    return redactedResult
  }
}
