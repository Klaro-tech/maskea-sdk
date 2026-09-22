# Maskea Portfolio Strategy (Session 4)

How maskea, Consentra, and Sentinel reinforce each other instead of
overlapping, and the upgrade paths between them that should never feel
like switching products.

---

## 1. What each product actually is, stated plainly

- **maskea** — a developer's tool. Installed by an individual
  engineer, in their own codebase, with no organizational buy-in
  required. Lives at the code layer.
- **Consentra** — a compliance tool for a WEBSITE (cookie consent,
  GDPR/CCPA). Installed by whoever owns the site (often not an
  engineer — a founder, a marketer), lives at the visitor-facing layer.
- **Sentinel** — a security/compliance intelligence platform for an
  ORGANIZATION. Sold to whoever owns security/compliance risk (a
  founder at a small company, a security lead at a larger one), lives
  at the org-wide governance layer.

The real risk of overlap isn't feature duplication — it's confusing a
buyer about which layer they're at. A developer evaluating maskea
should never wonder "wait, is this the same as Sentinel." The products
should share a visual/brand language (already true — same site, same
pricing page structure) but never share positioning language.

## 2. The actual overlap that's worth being deliberate about

maskea's PII/secrets redaction and Sentinel's compliance scanning
both touch "sensitive data handling," and Consentra's consent tracking
and Sentinel's compliance evidence both touch "GDPR." These are NOT
overlaps to eliminate — they're the connective tissue the upgrade path
is built on (§3). The rule: maskea/Consentra do the narrow, real-time
thing (redact this call, get this consent); Sentinel does the org-wide
aggregation and evidence layer on top. Neither should try to do the
other's job.

## 3. The upgrade path, concretely

Per the milestone framing already agreed (Love → Share → Team →
Organization → Governance):

1. **Love**: a developer installs `@maskea/sdk`, it works, they
   don't think about Maskea again for weeks except running `maskea
   doctor` occasionally.
2. **Share**: they show a teammate `maskea benchmark`'s output or the
   `doctor` health score — this is organic, not a referral program.
3. **Team**: the team upgrades to Maskea Cloud (Team tier) once they
   want shared visibility across projects — still entirely the
   developer's own initiative, no sales conversation yet.
4. **Organization**: now that maskea is genuinely embedded across
   the org's AI usage, the ORGANIZATION (not the original developer)
   starts asking questions Sentinel actually answers: "are we handling
   this data compliantly across everything, not just our AI calls,"
   "can we prove this to a customer's security questionnaire." This is
   the actual Sentinel trigger — not a maskea upsell banner, a
   real organizational need that maskea usage made visible.
5. **Governance**: Sentinel gets evaluated and bought by whoever owns
   that org-wide risk — who may never have touched maskea
   directly. The connection Sentinel's own sales/onboarding should make
   explicit: "we already see your AI infrastructure is on maskea —
   here's how Sentinel extends that visibility org-wide," which is a
   warmer opening than a cold pitch, but only works if Sentinel can
   actually SEE that (a real integration, not just a talking point —
   see §4).

## 4. What actually needs to be built for this to be real, not aspirational

- **Sentinel's connector framework already exists** (per the maskea
  repo's earlier V5 foundation work) — a maskea connector that
  lets a Sentinel customer see "this org has N projects on maskea,
  here's their aggregate redaction/budget health" is a real, buildable
  integration once Maskea Cloud's data model (Session 2) exists to pull
  from. Do not build this before Maskea Cloud ships — there's nothing
  org-wide to connect to yet.
- **Consentra ↔ Sentinel already has a connective pattern**: Sentinel's
  compliance modules can reference Consentra's consent records as
  evidence. The same pattern (maskea Cloud data as a Sentinel
  evidence source) should reuse that existing design, not invent a
  second integration model.
- **No shared login is required for this to work.** A developer using
  maskea doesn't need a Sentinel account for the "Love → Share →
  Team" stages — the moment "Organization → Governance" happens is
  exactly when a NEW buyer (often a different person) starts a NEW
  relationship with Sentinel. Forcing account unification earlier than
  that adds friction to the free/cheap stages for a benefit that only
  matters at the expensive stage.

## 5. What NOT to do

- Don't cross-sell Sentinel inside the maskea CLI or dashboard.
  The moment `maskea doctor` prints an ad for a different product, it
  stops being a trustworthy diagnostic tool and starts being a sales
  surface — the exact thing the "developer tool, not a security
  platform" positioning (Session 1) is built to avoid.
- Don't rename or reposition Consentra/Sentinel to sound more like
  maskea's "AI Runtime" framing. They're deliberately different
  products at different layers (§1) — forcing shared vocabulary across
  products that serve different buyers at different org levels creates
  the exact confusion this document exists to prevent.
- Don't build the Sentinel↔maskea connector speculatively ahead
  of Maskea Cloud existing (§4) — there's no real data to connect until
  then, and a stub integration that doesn't actually show anything
  useful is worse than no integration, since it's the first impression
  a Sentinel customer gets of the maskea relationship.

## Summary for whoever picks this up

The portfolio strategy is: let maskea win on its own terms as a
developer tool (Sessions 1-3 fully cover this), let that adoption
create real organizational visibility once Maskea Cloud exists (Session
2), and let SENTINEL be the one to make the governance pitch once
there's something real to point to — never the other way around.
