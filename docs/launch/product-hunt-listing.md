# Product Hunt listing — draft

Written from what's actually shipped and verified as of 2026-08-12 (v0.6.1).
No invented metrics, no fake social proof — this is a brand-new package with
zero real users yet, and the copy says so honestly rather than implying
otherwise.

## Tagline (60 char max)

> The AI runtime every LLM app should install on day 1

(59 chars)

Alternates:
- "Retries, budgets, and PII redaction for every LLM call" (57 chars)
- "Stop rebuilding AI infrastructure from scratch" (48 chars)

## Description (260 char max, shown under the tagline)

> Wrap your existing OpenAI/Anthropic/Vercel AI SDK calls with retries,
> budget caps, secret/PII redaction, and structured-output validation —
> one line, zero required cloud account. Local-first, MIT licensed, real
> CLI (doctor, benchmark, dashboard, report).

(258 chars)

## First comment (maker's comment, posted immediately after launch)

> Hey, I built this because every AI app I've shipped ends up rewriting
> the same five things: retry logic for 429s, a budget cap so a runaway
> loop doesn't blow the bill, secret/PII scrubbing before logs go anywhere,
> and a way to actually see what's happening without standing up a whole
> observability stack.
>
> `@maskea/sdk` wraps your existing provider SDK call — one line,
> `maskea.wrap(openai.chat.completions.create)` — and composes whichever of
> those five middlewares you need. No required account, no required API
> key of ours, everything runs in-process and logs to `.maskea/` locally.
>
> `maskea doctor` checks provider connectivity and gives you a real health
> score. `maskea benchmark` compares latency+cost across providers for one
> prompt and tells you which one's actually cheaper for your workload.
> `maskea dashboard` opens a local web UI — zero cloud, reads `.maskea/`
> directly.
>
> If you want team dashboards or cross-project budget rollups later,
> there's an optional Maskea Cloud (`maskea cloud login` / `maskea cloud
> link`) — but the whole point is that nothing above ever requires it.
>
> MIT licensed. Would love feedback, especially on what's missing for your
> actual stack (LangChain/LlamaIndex support is there; open to more).

## Gallery (screenshots needed — not yet captured)

Real terminal output only, no mockups, matching the site's own "every
terminal capture on this page comes from an actual execution" standard:

1. `maskea doctor` output (colored, real provider connectivity check)
2. `maskea dashboard` running in a browser (localhost:3456)
3. `maskea benchmark` comparing 2-3 real providers
4. The recipes page (`maskea.services/maskea/recipes`) showing the
   category grid
5. Maskea Cloud dashboard with a real synced project

**Action needed from Vikram**: capture these 5 screenshots for real (not
mockups) before submitting — same standard the site itself already holds
to.

## Topics/categories to select on PH

Developer Tools, Artificial Intelligence, Open Source, Node.js
