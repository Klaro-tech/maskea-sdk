# Maskea Cloud — Product Architecture (Session 2)

Architecture decisions only — no code in this document. Written to be
consistent with Maskea's existing infrastructure (Supabase, Razorpay,
the same multi-tenant patterns already used by Sentinel/Consentra)
rather than inventing a new stack, since every extra platform is
operational cost with no product benefit to the customer.

---

## 1. What Cloud actually is

The SDK is 100% local by design (Session 1's honesty constraint depends
on this staying true). Cloud is an **opt-in sync target**: the SDK
already writes structured data to `.maskea/*.jsonl` locally; Cloud's job
is to also send that data to a Maskea-hosted API, and to be the read side
for anything that needs to exist outside one developer's laptop (team
dashboards, cross-project budget aggregation, shared alerts).

**Hard boundary, stated explicitly so nobody accidentally breaks it
later:** the SDK must never require a network call to a Maskea server to
function. Cloud sync is `.use(cloudSync({ apiKey }))` as an ADDITIONAL
middleware a paying customer adds to their existing chain — never a
replacement for local logging, never something the free tier's
retries/budget/secrets/pii middleware silently depends on.

## 2. Data model

Reuses the shape already defined by the SDK's local storage, not a
redesigned schema:

- `projects` — one row per `maskea.config` a customer has connected.
  Owned by a `workspace_id` (see auth below).
- `calls` — one row per `.maskea/logs.jsonl` record synced up. Same
  fields (callId, attempt, durationMs, ok, error, secretHits, piiHits,
  timestamp) plus `project_id`.
- `spend` — mirrors `.maskea/budget.jsonl`, one row per recorded cost,
  plus `project_id`.
- `workspaces` — the billing/team unit. A workspace has a plan (from
  the 4 tiers), members, and owns 1+ projects.
- `alerts` — Team-tier+, a rule (budget threshold, error rate
  threshold) plus a destination (Slack webhook, email).

No new entity types beyond what the SDK already produces locally —
Cloud is a sync target and aggregator, not a separate product with its
own data model to design from scratch.

## 3. Authentication

Two distinct credentials, matching the SDK's own "zero required account"
principle:

- **Project API key** (`klaroshield_proj_...`) — what `cloudSync({
  apiKey })` uses. Scoped to ONE project, write-only (can push call/spend
  records, cannot read other projects' data, cannot change billing).
  Issued the moment a project is registered, no human login required to
  generate one — a CI pipeline should be able to sync without a browser
  session.
- **Workspace login** (email+password or GitHub OAuth, reusing the same
  Supabase Auth instance Sentinel/Consentra already run on, not a new
  auth provider) — for the dashboard, billing, team management. This is
  the ONLY place a human logs in; the SDK itself never does.

## 4. Project registration flow

1. `maskea cloud login` (new CLI command, not yet built) opens a browser
   to the Cloud dashboard's login page.
2. Once logged in, `maskea cloud link` registers the current directory's
   `maskea.config` as a project under the logged-in workspace, writes the
   issued project API key to `.maskea/cloud.json` (gitignored by
   default — the scaffold's `.gitignore` needs this added).
3. Developer adds `.use(cloudSync())` to their config, which reads the
   key from `.maskea/cloud.json` automatically — no manual key-pasting
   into code required if this flow is used, though manual `apiKey`
   config is the fallback for CI/environments without a local `maskea
   cloud link` step.

## 5. Sync model

- **Push-only from the SDK's side, batched, non-blocking.** `cloudSync()`
  buffers records in memory and flushes on an interval (default 30s) or
  when the buffer hits a size cap — never blocks the actual AI call
  waiting on a sync request, since that would violate "never depends on
  cloud availability" the moment Maskea's own API has a bad day.
- **Sync failure is silent-degrade, logged locally, never thrown.**
  Exactly the same non-blocking discipline the local middleware already
  uses for its own internal failures (e.g. budget()'s "unrecognized
  model, skip silently" rule) — the standard should be Cloud sync
  failing is invisible to the developer's actual AI call, always.
- **No pull sync to the SDK.** Remote configuration (a Developer-tier
  feature) means the DASHBOARD can push config changes that `maskea cloud
  link`-ed projects pick up on their next sync interval, not that the
  SDK actively polls Cloud for instructions on every call — polling on
  every call would reintroduce the exact latency/availability dependency
  the whole local-first design exists to avoid.

## 6. Billing

Razorpay, matching every other Maskea product (Sentinel/Consentra/Books)
— the 6 plans already created live in Session 1's companion pricing work
(`maskea repo lib/razorpay-plans.ts`, `klaroshield_v1_*` keys) are the
real billing objects to wire up, not placeholders. Workspace-level
subscription, not per-project — a Team-tier workspace's plan governs
all projects under it.

## 7. Feature boundaries (what's actually gated by tier)

Kept deliberately narrow and enforceable, avoiding the "artificial
scarcity" trap already flagged in the earlier pricing revision:

| Tier | Enforced limit | Everything else |
|---|---|---|
| Community | 3 projects **connected to Cloud** (local execution is always unlimited, this only caps how many projects can sync) | No cloud dashboard access at all |
| Developer | 15 projects, 90-day history retention | Dashboard, cost insights, remote config |
| Team | 75 projects, unlimited history | + shared workspaces, Slack/email alerts, audit log |
| Startup | Unlimited projects | + org-wide analytics, routing insights, priority support |

Only 2 things are ever actually enforced server-side: **project count**
and **history retention window**. Everything else ("cost insights",
"routing insights", "audit log") is a dashboard feature flag on top of
the same underlying data every tier's projects already sync — simpler
to build, simpler to explain, no risk of an artificial paywall
appearing mid-feature.

## 8. What's explicitly NOT in v1 of Cloud

- No SSO (Enterprise-only, per the original pricing brief — separate,
  later work, same pattern as Sentinel's SSO).
- No VPC/self-hosted deployment (Enterprise-only, later).
- No cross-workspace anything (the AI Runtime Index idea from the later
  brief needs anonymized cross-CUSTOMER aggregation, which is a distinct,
  much later feature requiring its own consent/privacy design — not
  scoped here).

## Build order

1. `workspaces`/`projects` tables + Supabase Auth wiring (reuse existing
   Maskea auth patterns) — no new UI yet, just the data layer.
2. `cloudSync()` middleware in the SDK (the only new SDK-side code Cloud
   requires) + `maskea cloud login`/`maskea cloud link` CLI commands.
3. Minimal dashboard: project list, per-project call/spend view (this is
   the actual MVP — "can I see my data" before any team/alert features).
4. Team features (shared workspaces, alerts) once the MVP proves the
   sync pipeline is reliable in practice, not before.
