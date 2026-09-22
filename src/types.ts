// Core middleware contract. Modeled on Express/Koa's (req, next) shape, but
// generic over the call signature instead of HTTP -- maskea.wrap() accepts
// ANY async function (an OpenAI call, an Anthropic call, a Vercel AI SDK
// generateText call), so middleware can't assume a specific provider's
// argument/response shape. This is the answer to "wraps rather than
// replaces": rather than building bespoke per-provider adapters (OpenAI's
// shape differs from Anthropic's differs from Vercel AI SDK's), middleware
// wraps the developer's OWN call function, whatever provider it happens to
// call -- the same pattern already used for Anthropic/OpenAI SDKs' own
// request interceptors, just made composable.
export type KlaroContext = {
  /** Random per-call id, stable across the whole middleware chain for one call -- used to correlate log lines, budget checks, and retries for the same request. */
  callId: string
  startedAt: number
  /** Attempt number within a single call, incremented by retries() -- starts at 1. */
  attempt: number
  /** Arbitrary bag other middleware can read/write -- e.g. validation() stashes a zod schema here for logging() to reference. */
  meta: Record<string, unknown>
}

export type KlaroNext<TArgs extends unknown[], TResult> = (args: TArgs) => Promise<TResult>

export type Middleware<TArgs extends unknown[] = unknown[], TResult = unknown> = (
  args: TArgs,
  next: KlaroNext<TArgs, TResult>,
  ctx: KlaroContext
) => Promise<TResult>
