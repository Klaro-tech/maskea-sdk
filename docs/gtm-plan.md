# maskea GTM System (Session 3)

Asset-driven, not paid-ads-driven — consistent with the earlier brief's
"forget paid ads, build around assets" direction. Every week ships one
real thing, not a marketing task with no artifact.

---

## 1. Launch prerequisite checklist

Do not start the 90-day calendar until these are true — launching before
they're ready burns the one shot at each channel's algorithm/audience:

- [ ] Homepage live (Session 1 sections 1-5, 8-9; Playground can follow)
- [ ] `README.md` rewritten to lead with the install command and the
      real code example, not a feature list (see §5 below)
- [ ] At least 4 real recipes published (Session 1 §7's teaser set)
- [ ] `maskea doctor`/`stats`/`explain`/`simulate`/`benchmark` all have a
      GIF or short screen recording — text-only CLI output doesn't
      survive a Twitter/Reddit feed the way a 10-second clip does
- [ ] npm package has a README that renders correctly on npmjs.com
      (separate from GitHub's rendering — verify both)

## 2. 90-day calendar

**Weeks 1-2 — Foundation (no public launch yet)**
- Week 1: GitHub repo goes public. Real README, real LICENSE, CONTRIBUTING.md,
  issue templates. No announcement push yet — this is so the repo has
  commit history and isn't a ghost-town the moment Product Hunt traffic
  arrives.
- Week 2: Publish 10 more recipes (14 total). Seed 3-5 GitHub issues
  ourselves for genuinely deferred work (dashboard, playground, more
  recipes) — an empty issues tab reads as an abandoned project.

**Weeks 3-4 — Soft channels**
- Week 3: Dev.to post — "Why every AI app ends up writing the same
  500 lines of retry/redaction code" (the problem-framing post, not a
  product pitch — links to maskea once, in the last paragraph).
- Week 4: Reddit (r/LocalLLaMA for the Ollama angle specifically,
  r/node or r/typescript for the SDK angle) — post the `maskea doctor`
  GIF with minimal text, let the tool speak.

**Week 5 — Hacker News**
- "Show HN: maskea — retries, budgets, and PII redaction for any
  AI SDK call". Post Tuesday-Thursday, 8-10am ET (HN's highest-traffic
  window). Title must pass the litmus test already established: would
  a stranger stop scrolling for this. "Show HN" + a working `npm
  install` + a real GIF is the format that survives HN's skepticism of
  marketing language.

**Week 6 — Product Hunt**
- Launch Tuesday-Thursday (never Monday/Friday — lowest PH traffic
  days). Assets needed by end of Week 5: a 1-minute demo video (not
  just GIFs), a tagline (reuse the homepage one-sentence), 5-8
  screenshot/GIF gallery images, first comment drafted in advance
  (the maker's own comment explaining the "why," posted immediately
  at launch, sets the tone for the thread).

**Week 7 — YouTube**
- One real walkthrough video: install → doctor → simulate → benchmark,
  ~5 minutes, screen recording with voiceover. Not an edited "trailer" —
  developers trust unpolished screen recordings of real usage more than
  produced marketing video for a dev tool.

**Week 8 — Medium/cross-post**
- Republish the Dev.to post (canonical-linked, not duplicate content)
  plus a second piece: "What I learned building an AI middleware SDK
  people actually installed" — a retrospective post, which is the piece
  most likely to get organic shares since it's not selling anything.

**Weeks 9-12 — Sustain, don't launch again**
- One recipe per week (targeting 30+ by end of week 12, per the content
  brief's "40+ recipes" goal — remaining ~10 in weeks 13+).
- Respond to every GitHub issue within 48h — in the first 90 days,
  responsiveness matters more than roadmap velocity for converting
  early adopters into repeat users.
- Weekly `maskea stats`-style build-in-public tweet if there's real
  install/usage data worth sharing (actual numbers only — a fabricated
  "10k downloads!" claim that npm's own public stats contradict is a
  credibility risk, not a growth hack).

## 3. GitHub README (rewrite spec)

Current README (already written this session) is close but was written
for npm's audience (assumes the reader is already installing). GitHub's
audience needs convincing first. Structure:

1. One-sentence positioning + badge row (npm version, license, build
   status once CI exists).
2. The 30-second install+code example (Session 1 §3, verbatim).
3. A GIF of `maskea doctor` immediately after — this is the single
   highest-leverage piece of the README, shows real value before
   asking for a `git clone`.
4. "Why" — 3 sentences max on the actual problem (every AI app
   rebuilds this), not a feature list.
5. Feature list (the existing README's middleware/CLI sections are fine
   here, this is where a reader who's already convinced wants detail).
6. Link to recipes, docs, contributing.

## 4. SEO plan (100+ pages, realistic path)

- 40 recipe pages (Workstream 4) — each targets a specific long-tail
  query ("openai retry typescript", "claude fallback nextjs") a
  generic homepage can never rank for.
- ~15 doc pages (one per middleware + CLI command + getting-started +
  FAQ) — necessary regardless of SEO, doubles as content.
- ~10 comparison pages, written honestly (maskea vs. LiteLLM vs.
  Portkey vs. Helicone) — these convert well IF genuinely fair; a
  transparently biased comparison page is worse than not having one,
  since technical readers check.
- Remainder from the blog/Dev.to/Medium cadence above, syndicated back
  to the docs site as a blog section.

## 5. Community plan

- GitHub Discussions enabled from Week 1 (not Discord/Slack yet — a
  community platform with 3 members reads as more abandoned than a
  GitHub Discussions tab with the same 3 members, since GitHub's own
  UI doesn't emphasize member count the way Discord does).
- Revisit a Discord only once there's a real sustained volume of
  questions/discussion that GitHub Discussions' threading model
  struggles with — don't stand up infrastructure ahead of the need.

## Non-negotiable constraint

Nothing in this calendar launches ahead of Session 1's homepage being
live with the honesty constraints intact (no "Cloud sync" checkout
enabled before Cloud exists). A Hacker News or Product Hunt audience
that hits a paywall for a feature that doesn't work yet is a
reputational cost this launch doesn't get a second chance to undo.
