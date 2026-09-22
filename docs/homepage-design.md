# maskea Homepage Design — Session 1

Blueprint for the marketing site and documentation. Every code example and
CLI output shown here is real — copied from actual verified runs against
`@maskea/sdk@0.2.0`, not invented for marketing. Where a section
references something not yet built (the local dashboard, the playground),
it's marked **[NOT YET LIVE]** so whoever builds the site knows what to
gate behind a "coming soon" state rather than ship a broken demo.

---

## 1. The one sentence (decision made, not a menu)

> **Stop rebuilding AI infrastructure.**

Subheading:

> Retries, budgets, secret and PII redaction, and cost tracking for every
> AI call — installed in one line, with zero required account.

Why this one over the alternatives already on the table:
- "The AI Runtime every AI application installs on Day 1" is a category
  claim, not a benefit — it tells the reader what we call ourselves, not
  what changes for them in the next five minutes.
- "Everything around your AI calls. Nothing you have to build yourself."
  is close but reads like a feature list summary, not a hook.
- "Stop rebuilding AI infrastructure" is a command aimed at a specific,
  real frustration (every team ends up writing this exact retry/redact/
  track code once) and it's short enough to be the actual `<h1>`, not
  wrapped across two lines on mobile.

## 2. Hero section

```
   Stop rebuilding AI infrastructure.

   Retries, budgets, secret and PII redaction, and cost tracking
   for every AI call. Installed in one line. Zero required account.

   ┌─────────────────────────────────────┐
   │ $ npm install @maskea/sdk       │  [copy icon]
   └─────────────────────────────────────┘

   [ View on GitHub ]   [ Read the docs ]
```

No email capture, no "book a demo," no account wall above the fold. The
install command IS the CTA — anything else competing with it for
attention works against the "why am I building this myself" reaction
we're going for in the first 30 seconds.

## 3. The 30-second code example

Real, copy-pasted from `README.md`, not simplified into something that
doesn't actually run:

```ts
import { Maskea, retries, budget, secrets, pii, logging } from "@maskea/sdk";
import OpenAI from "openai";

const openai = new OpenAI();

const maskea = new Maskea()
  .use(retries({ max: 3, backoff: "exponential" }))
  .use(budget({ maxMonthlyUsd: 50 }))
  .use(secrets({ mode: "mask" }))
  .use(pii({ mode: "mask" }))
  .use(logging({ format: "pretty" }));

const chat = maskea.wrap(openai.chat.completions.create.bind(openai.chat.completions));
```

One caption line under it, small and honest:
*"Wraps your existing OpenAI/Anthropic call. Doesn't replace your SDK,
doesn't require a Maskea account."*

## 4. "Why developers install it" — 6 cards

Each card names a REAL, shipped capability. No aspirational cards.

| Icon | Title | One line |
|---|---|---|
| 🔁 | Smart retries | Exponential backoff with jitter — only retries what's actually transient (429/5xx), never burns your rate limit on a 401. |
| 🔒 | Secrets & PII, gone | Deep-scans every call for API keys, JWTs, emails, SSNs, cards — masked before they ever leave your process. |
| 💰 | Know your spend | Real cost estimated from your provider's own usage response, tracked locally, capped if you want. |
| 🩺 | `maskea doctor` | Checks provider connectivity for real, flags an unhealthy retry rate, recommends a cheaper model — backed by your own recorded usage, not a guess. |
| 🧪 | `maskea simulate` | Run rate limits, timeouts, bad JSON, and prompt injection through YOUR pipeline before they happen in production. |
| 📦 | Zero lock-in | MIT licensed. Runs entirely local. `.maskea/` is a folder of JSON files you already own. |

## 5. CLI section — animated terminal

Show the REAL output (captured from an actual run), not a redesigned
mockup. Cycle through 3 commands on a loop, ~4s each:

**`maskea doctor`** (real output shape, live-verified this session):
```
────────────────────────────
AI Runtime Health
────────────────────────────

✓ Node.js version          v22.23.1
✓ OpenAI Connected         authenticated
✓ Claude Connected         authenticated
⚠ Gemini Connected         GEMINI_API_KEY not set
✓ Retry Policy             4% of calls needed a retry — healthy
✓ .maskea/ local storage    exists

⚠ gpt-4-turbo costs 98% more than gpt-4o-mini for comparable output
  Potential savings: $0.98 based on your recorded usage

Health Score: 92/100
```

**`maskea stats`** ("Today's AI Health" card — exact real format already
shipped).

**`maskea benchmark`** (real markdown table output).

## 6. Interactive Playground **[NOT YET LIVE — build order below]**

Spec for what to build, not a description of something that exists:

- A single text input ("Try a prompt — no signup, runs in your browser
  session only").
- Submits to a sandboxed serverless function running the SAME middleware
  code as the npm package (import the real package, don't reimplement
  the logic in the website's own code — divergence between the demo and
  the real SDK is the single fastest way to lose credibility).
- Visualizes the pipeline live: prompt → secrets scan → PII scan → retry
  simulation → cost estimate → response, each step lighting up as it
  completes.
- No real provider call needed for the demo — the "response" step can be
  a canned reply; the part worth demoing is the middleware pipeline
  itself, not proving an LLM can answer a question.
- Build cost: real engineering effort (sandboxed execution, a small
  serverless endpoint, the visualization UI) — this is the single
  largest homepage component, budget it as its own mini-project, not a
  homepage "section."

## 7. Recipes teaser

3-4 recipe cards on the homepage linking out to the full recipes library
(Session 3/Workstream 4 — 40+ pages, not written yet). Homepage only
needs enough to prove the concept exists:
- "OpenAI + exponential backoff"
- "Claude fallback when GPT-5 is rate limited"
- "Budget per customer, not per app"
- "Mask PII in a Next.js server action"

Each card: 3-line description + "Copy recipe →". Real content, even if
only these 4 exist at launch — do not ship placeholder/lorem cards.

## 8. Pricing section

Sell outcomes, per the reframe already agreed:

| | Community | Developer | Team | Startup |
|---|---|---|---|---|
| Price | **Free** | **$30**/mo · $330/yr | **$90**/mo · $990/yr | **$200**/mo · $2,200/yr |
| | Unlimited local execution, forever | Work across up to 15 projects | Up to 75 projects, shared workspaces | Unlimited projects |
| | | Cloud sync + cost insights | Team policies + Slack alerts | Advanced routing insights |
| | | Remote configuration | Audit history | Org-wide analytics |
| | | 90-day history | Team analytics | Priority support |

Annual billing note directly under the table, not buried in fine print:
*"Annual plans are billed once, not monthly — 11 months' price for 12
months of service."*

**Honesty constraint for whoever builds this section:** every "Cloud
sync"/"Remote configuration"/"Team policies" line item describes Maskea
Cloud, which does not exist yet (Session 2, not started). Do not enable
checkout on Developer/Team/Startup until Cloud is real — a customer
paying $30/mo for "cloud sync" that doesn't exist is a support and trust
problem, not a growth hack. Ship Community + a clearly marked "Cloud:
coming soon, join the waitlist" for the paid tiers until Session 2 ships.

## 9. Footer

Standard: GitHub, Docs, Discord/community link (Session 3), Twitter,
Privacy/Terms, "Built by the team behind Sentinel & Consentra" (soft
portfolio signal, not a hard cross-sell — per Session 4's "never feel
like switching products" principle).

## 10. Tone & visual direction

- Vercel/Linear register: dark-mode-first, monospace for anything
  code/terminal, generous whitespace, no stock illustration, no gradient
  blob backgrounds.
- Every screenshot on the page must be a REAL terminal/CLI capture, not
  a redesigned graphic — the moment a visitor senses the CLI output on
  the homepage doesn't match what `npx maskea doctor` actually prints,
  the whole page's credibility drops.
- No version numbers anywhere on the page (already-established rule).

## Build order recommendation

1. Hero + code example + CLI animation + pricing (all real, no new
   engineering — copy/paste from what's already shipped and verified).
2. Recipes teaser (4 real recipes, written as real content).
3. Playground (the one section needing real new engineering — budget it
   separately, don't let it block shipping 1-2).
4. Full recipes library, docs site — Session 3 scope, not homepage scope.
