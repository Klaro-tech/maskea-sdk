# "Show HN" post — draft

HN's own guidelines: no marketing language, technical detail up front,
honest about limitations. Written accordingly.

## Title (80 char max)

> Show HN: @maskea/sdk – retries, budget caps, and PII redaction for LLM calls

(83 chars — over limit, needs trimming)

Trimmed:
> Show HN: Maskea – retries, budget caps, PII redaction for LLM calls

(68 chars)

## Post body

I kept rewriting the same middleware for every LLM-calling project:
retry logic for 429s, a hard budget cap so a bug doesn't turn into a
surprise bill, secret/PII scrubbing before anything gets logged, and
some way to actually see what's happening.

`@maskea/sdk` is that, packaged as composable middleware over your
existing provider SDK call — it wraps the function, it doesn't replace
the SDK:

```ts
import { Maskea, retries, budget, secrets, pii } from "@maskea/sdk";
import OpenAI from "openai";

const openai = new OpenAI();
const maskea = new Maskea()
  .use(retries({ max: 3, backoff: "exponential" }))
  .use(budget({ maxMonthlyUsd: 50 }))
  .use(secrets({ mode: "mask" }))
  .use(pii({ mode: "mask" }));

const chat = maskea.wrap(openai.chat.completions.create.bind(openai.chat.completions));
```

Design constraints I held to:

- **No required account.** Everything above runs entirely in-process.
  `.maskea/` (created on first use) holds local logs and budget records as
  JSONL — no network call unless you explicitly opt into Cloud sync.
- **Wraps, never replaces.** `maskea.wrap()` takes any async function, so
  it works the same whether you're calling OpenAI, Anthropic, or Vercel
  AI SDK's `generateText` — it doesn't assume a provider's shape.
- **Retries are conservative by default.** Only 429/5xx and known
  transient network errors retry — a 400 or 401 retrying three times just
  burns your rate limit on a call that was never going to succeed.
- **Redaction never gets a "show me the raw value" mode.** The whole
  point of `secrets()`/`pii()` is that the raw sensitive value never
  gets persisted anywhere, including the local logs — so there's no diff
  view, by design, not by omission.

Real CLI, not just the library: `maskea doctor` (provider connectivity +
health score), `maskea benchmark` (compares latency/cost across providers
for one prompt), `maskea dashboard` (local web UI, zero cloud), `maskea
report --format pdf` (exportable summary for a PR/team update).

What's honestly still thin: LangChain/LlamaIndex support exists via the
generic wrap (works, not deeply tested against every version), and
there's no Python port yet if that's what you need.

MIT licensed: https://github.com/Maskea-tech/maskea-sdk
Docs: https://maskea.services/maskea/docs
Live playground (no signup): https://maskea.services/maskea/playground

Happy to answer questions about the design tradeoffs.
