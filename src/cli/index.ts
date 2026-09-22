#!/usr/bin/env node
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { join, dirname } from "node:path"
import { Command } from "commander"
import { doctor } from "./commands/doctor.js"
import { stats } from "./commands/stats.js"
import { inspect } from "./commands/inspect.js"
import { init } from "./commands/init.js"
import { version } from "./commands/version.js"
import { explain } from "./commands/explain.js"
import { simulate } from "./commands/simulate.js"
import { benchmark } from "./commands/benchmark.js"
import { dashboard } from "./commands/dashboard.js"
import { telemetryStatus, telemetryEnable, telemetryDisable } from "./commands/telemetry.js"
import { report } from "./commands/report.js"
import { cloudLogin, cloudLink, cloudStatus } from "./commands/cloud.js"

// Read once at startup rather than hardcoding a second copy of the version
// string here -- a hardcoded string previously drifted from
// package.json's real version the moment a release changed one but not
// the other (this line still said "0.1.0" after 0.2.0 shipped).
const here = dirname(fileURLToPath(import.meta.url))
const pkg = JSON.parse(readFileSync(join(here, "..", "..", "package.json"), "utf8")) as { version: string }

const program = new Command()

program
  .name("maskea")
  .description("maskea CLI — local diagnostics for the AI runtime, no cloud account required.")
  .version(pkg.version)

program
  .command("init")
  .description("Scaffold a maskea.config.ts in the current project")
  .action(init)

program
  .command("doctor")
  .description("Check provider API keys, env vars, and local runtime health")
  .action(doctor)

program
  .command("inspect")
  .description("Show recent requests: latency, cost, redactions")
  .option("-n, --limit <n>", "number of recent calls to show", "10")
  .action((opts) => inspect(Number(opts.limit)))

program
  .command("stats")
  .description("Show local token spend and request counts by model")
  .action(stats)

program
  .command("version")
  .description("Show the installed maskea SDK/CLI version")
  .action(version)

program
  .command("explain [callId]")
  .description("Narrate what happened on a call (most recent by default) in plain language")
  .action((callId) => explain(callId))

program
  .command("simulate")
  .description("Run common failure modes (rate limits, timeouts, bad JSON, ...) through your configured pipeline")
  .action(simulate)

program
  .command("benchmark")
  .description("Compare latency and cost across providers with a real test call, recommend the cheapest")
  .action(benchmark)

program
  .command("dashboard")
  .description("Open a local web dashboard (requests, cost, redactions, health) -- nothing leaves this machine")
  .option("-p, --port <port>", "port to listen on", "3456")
  .action((opts) => dashboard(Number(opts.port)))

program
  .command("report")
  .description("Export an AI runtime report (health score, spend, recent requests) as markdown, JSON, HTML, or PDF")
  .option("-f, --format <format>", "md, json, html, or pdf", "md")
  .option("-o, --out <path>", "write to a file instead of stdout")
  .action((opts) => report(opts))

const cloudCmd = program
  .command("cloud")
  .description("Maskea Cloud — opt-in sync for team dashboards, cross-project budgets, and alerts. Never required for the SDK to function.")

cloudCmd
  .command("login")
  .description("Open the Cloud dashboard to sign in and create a project")
  .action(() => cloudLogin())

cloudCmd
  .command("link")
  .description("Save a project API key locally so cloudSync() can authenticate")
  .option("-k, --key <key>", "project API key (prompts if omitted)")
  .option("--api-url <url>", "override the Cloud API base URL")
  .action((opts) => cloudLink(opts))

cloudCmd
  .command("status")
  .description("Show whether this directory is linked to a Cloud project")
  .action(() => cloudStatus())

const telemetryCmd = program
  .command("telemetry")
  .description("Show or change anonymous usage telemetry settings")

telemetryCmd
  .command("status", { isDefault: true })
  .description("Show what's collected and whether telemetry is enabled")
  .action(telemetryStatus)

telemetryCmd
  .command("enable")
  .description("Enable anonymous usage telemetry")
  .action(telemetryEnable)

telemetryCmd
  .command("disable")
  .description("Disable anonymous usage telemetry -- the SDK stays fully functional")
  .action(telemetryDisable)

program.parse()
