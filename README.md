# @maskea/sdk

The AI Runtime every AI application installs on Day 1. Not a gateway, not a
security platform — a local middleware pipeline that wraps your existing
OpenAI/Anthropic/Vercel-AI-SDK calls with retries, budget control, secret
and PII redaction, structured output validation, and local logging.

**Zero required cloud account. Zero required API key of ours. Wraps your
existing provider SDK — never replaces it.**

## Install

```bash
npm install @maskea/sdk
```

## Use

```ts
import { Maskea, retries, budget, secrets, pii, logging } from "@maskea/sdk";
import OpenAI from "openai";

const openai = new OpenAI();

const maskea = new Maskea()
  .use(retries({ max: 3, backoff: "exponential" }))
  .use(budget({ maxMonthlyUsd: 50 }))
  .use(secrets({ mode: "mask" }))
  .use(pii({ mode: "mask", types: ["email", "phone", "ssn", "credit_card"] }))
  .use(logging({ format: "pretty" }));

const chat = maskea.wrap(openai.chat.completions.create.bind(openai.chat.completions));

const response = await chat({
  model: "gpt-4o-mini",
  messages: [{ role: "user", content: "hello" }],
});
```

`maskea.wrap()` accepts any async function — it works the same way whether
you're calling OpenAI, Anthropic, or a Vercel AI SDK `generateText` call,
because it wraps *your* call, not a specific provider's API shape.

**A real TypeScript caveat, not a runtime issue:** wrapping a class method
via `.bind()` (required so `this` still resolves inside the provider SDK)
goes through `Function.prototype.bind`'s own deliberately weak type
signature, which loses overload resolution for methods like OpenAI's
`create()` that return a different type for `stream: true` vs `stream:
false`. Runtime behavior is correct either way; if TypeScript can't narrow
the result type, cast it explicitly (`as ChatCompletion`, `as Message`) —
see `examples/openai.ts` and `examples/anthropic.ts`.

Every middleware runs entirely in-process. Nothing here calls out to a
maskea server. `.maskea/` (created in your project root on first use)
holds local logs and spend records — inspect it with the CLI, or just read
the JSON Lines files directly.

## CLI

```bash
npx maskea init       # scaffold maskea.config.ts
npx maskea doctor     # provider connectivity (real API check), retry health, cost-optimization recommendations, health score
npx maskea inspect    # recent requests: latency, redactions
npx maskea stats      # "Today's AI Health": retries saved, secrets/PII removed, cost, latency, budget remaining, health score
npx maskea explain    # plain-language narration of a call's full retry/redaction history
npx maskea simulate   # runs rate-limit/500/timeout/bad-JSON/injection/huge-prompt scenarios through YOUR configured pipeline
npx maskea dashboard  # local web dashboard -- request stream, spend, redactions, health score
npx maskea report --format md|json|html|pdf --out <path>   # export the same data as a file
npx maskea version
npx maskea telemetry status   # what's collected, what's never collected, enable/disable

npx maskea cloud login    # open the Cloud dashboard to sign in and create a project
npx maskea cloud link     # save a project API key locally so cloudSync() can authenticate
npx maskea cloud status   # is this directory linked to a Cloud project?
```

## Telemetry

The CLI and SDK send anonymous, privacy-first product telemetry by
default -- helps us understand adoption (installs, active projects,
which middleware people actually use) without any registration.

**Never sent, ever:** prompts, responses, model output, API keys,
secrets, PII, local file paths, or anything from `.maskea/logs.jsonl`.
Only: a random installation ID (a UUID, never derived from your
hardware), which middleware you've configured, SDK/Node version,
platform, and which CLI command ran.

Fully transparent, fully optional:

```bash
npx maskea telemetry status    # see exactly what's collected
npx maskea telemetry disable   # opt out -- the SDK stays fully functional
```

or set `KLARO_TELEMETRY=0` in your environment, which always overrides
`.maskea/config.json`. See [maskea.services/maskea/privacy](https://maskea.services/maskea/privacy) for the full policy.

## Middleware

- **`retries({ max, backoff, baseDelayMs, maxDelayMs, isRetryable })`** — exponential backoff with full jitter, retries only genuinely transient errors (429/5xx/network) by default.
- **`budget({ maxMonthlyUsd, onExceeded })`** — estimates cost from the provider's own `usage` field (OpenAI/Anthropic shapes both supported) against a small built-in pricing table, persists spend to `.maskea/budget.jsonl`.
- **`secrets({ mode })`** — deep-scans call args for OpenAI/Anthropic/AWS/GitHub keys and JWTs, masks or blocks.
- **`pii({ mode, types })`** — deep-scans for email/phone/SSN/credit card, masks or blocks.
- **`validation({ schema, extractText, maxRetries })`** — re-runs the call if the response doesn't parse as JSON or fails a Zod-compatible schema's `safeParse`.
- **`logging({ format })`** — `"pretty"` (colored stdout), `"json"`, or `"silent"` (still persists to `.maskea/logs.jsonl`, just doesn't print).
- **`cloudSync({ apiKey, apiBaseUrl, flushIntervalMs, maxBufferSize })`** — optional, additive. Buffers each call's real record and pushes it to [Maskea Cloud](https://maskea.services/maskea/cloud) on an interval, batched and non-blocking; sync failures never surface to your actual AI call. Never required — everything above works with zero network calls to a Maskea server.

## Maskea Cloud (optional)

```bash
npx maskea cloud login   # opens maskea.services/maskea/cloud to sign in + create a project
npx maskea cloud link    # paste the project's API key, saved to .maskea/cloud.json
```

```ts
import { Maskea, retries, cloudSync } from "@maskea/sdk";

const maskea = new Maskea()
  .use(retries({ max: 3 }))
  .use(cloudSync()); // reads the key from .maskea/cloud.json automatically
```

Team dashboards, cross-project budget aggregation, and shared alerts —
sync target for what's already local, not a replacement for it.

## License

MIT. Free for developers, free for commercial application development.
Maskea Cloud (project sync, team workspaces, remote config, shared
dashboards) is a separate, optional, proprietary service — the SDK never
requires it.
