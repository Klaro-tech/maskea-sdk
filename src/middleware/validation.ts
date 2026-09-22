import type { Middleware } from "../types.js"
import { sendTelemetry } from "../telemetry/send.js"

// Duck-typed against Zod's actual shape rather than importing zod as a hard
// dependency -- a developer not using structured output (or using a
// different validation library) shouldn't have to install it just because
// this middleware exists in the chain unused.
export interface ZodLikeSchema<T> {
  safeParse(data: unknown): { success: true; data: T } | { success: false; error: unknown }
}

export interface ValidationOptions<T = unknown> {
  schema: ZodLikeSchema<T>
  /**
   * Where the actual model output text lives in the provider's response --
   * this varies by provider (OpenAI's choices[0].message.content,
   * Anthropic's content[0].text, a raw string from a simpler wrapper), so
   * there's no one correct default. The three most common shapes are tried
   * automatically; pass this to override for anything else.
   */
  extractText?: (result: unknown) => string | undefined
  /** Retries the WHOLE call (not just re-parsing) on validation failure, since malformed structured output is often just LLM non-determinism that a fresh attempt fixes. Default 2. */
  maxRetries?: number
}

function defaultExtractText(result: unknown): string | undefined {
  if (typeof result === "string") return result
  if (typeof result !== "object" || result === null) return undefined
  const r = result as any
  return (
    r?.choices?.[0]?.message?.content ??
    r?.content?.[0]?.text ??
    r?.text ??
    undefined
  )
}

export function validation<T = unknown>(options: ValidationOptions<T>): Middleware {
  sendTelemetry("middleware_validation_enabled")
  const extractText = options.extractText ?? defaultExtractText
  const maxRetries = options.maxRetries ?? 2

  return async (args, next, ctx) => {
    let lastError: unknown

    for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
      const result = await next(args)
      const text = extractText(result)
      if (text === undefined) {
        // Can't find any text to validate against this response shape --
        // fail open rather than silently pretend validation passed, so the
        // developer notices they need to pass extractText for their
        // provider instead of getting an unvalidated response with no
        // signal anything went wrong.
        throw new Error(
          "[maskea] validation(): could not locate output text in the response. " +
            "Pass extractText(result) to tell it where your provider puts the response text."
        )
      }

      let parsed: unknown
      try {
        parsed = JSON.parse(text)
      } catch (e) {
        lastError = e
        if (attempt <= maxRetries) continue
        throw new Error(`[maskea] validation(): output was not valid JSON after ${attempt} attempt(s): ${text.slice(0, 200)}`)
      }

      const validated = options.schema.safeParse(parsed)
      if (validated.success) {
        ctx.meta.validationAttempts = attempt
        return result
      }
      lastError = validated.error
      if (attempt > maxRetries) {
        throw new Error(`[maskea] validation(): schema validation failed after ${attempt} attempt(s): ${JSON.stringify(validated.error)}`)
      }
    }

    throw lastError
  }
}
