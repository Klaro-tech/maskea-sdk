import { existsSync } from "node:fs"
import { pathToFileURL } from "node:url"
import { join } from "node:path"
import pc from "picocolors"
import { simulate as runSimulation, ALL_SCENARIOS, type SimulationScenario } from "../../simulate.js"
import type { Maskea } from "../../maskea.js"
import { sendTelemetry } from "../../telemetry/send.js"

const SCENARIO_LABELS: Record<SimulationScenario, string> = {
  rate_limit: "429 Rate Limit",
  server_error: "500 Server Error",
  timeout: "Timeout",
  bad_json: "Bad JSON",
  prompt_injection: "Prompt Injection",
  huge_prompt: "Huge Prompt",
}

/**
 * `maskea simulate` runs against the DEVELOPER'S OWN configured pipeline
 * (imported from maskea.config.js in their project), not a generic
 * default -- the whole point is showing what THEIR retry/budget/redaction
 * settings actually do under failure, not a demo of the SDK in the
 * abstract. Requires a compiled/plain-JS config (maskea.config.js) since
 * this CLI has no TypeScript loader of its own to pull in a .ts file --
 * `maskea init` scaffolds .ts for editor ergonomics, so a TS project needs
 * to either compile it or run this via `node --import tsx`.
 */
export async function simulate(): Promise<void> {
  sendTelemetry("simulate_run", { cliCommand: "simulate" })
  const jsPath = join(process.cwd(), "maskea.config.js")
  const tsPath = join(process.cwd(), "maskea.config.ts")

  if (!existsSync(jsPath)) {
    if (existsSync(tsPath)) {
      console.log(
        "Found maskea.config.ts but this CLI can't import TypeScript directly.\n" +
          "Run this command via `node --import tsx node_modules/.bin/maskea simulate` instead, " +
          "or compile your config to maskea.config.js first."
      )
    } else {
      console.log("No maskea.config.js found in this directory. Run `maskea init` first.")
    }
    return
  }

  const mod = await import(pathToFileURL(jsPath).href)
  const maskea = mod.maskea as Maskea | undefined
  if (!maskea) {
    console.log('maskea.config.js was found but does not export a "maskea" instance. See the file `maskea init` scaffolds for the expected shape.')
    return
  }

  console.log(`${pc.bold("maskea simulate")} — testing your configured pipeline against common failure modes\n`)

  for (const scenario of ALL_SCENARIOS) {
    const result = await runSimulation(maskea, scenario)
    const icon = result.ok ? pc.green("✓") : pc.red("✗")
    console.log(`${icon} ${SCENARIO_LABELS[scenario].padEnd(20)} ${result.outcome} (${result.durationMs}ms)`)
  }

  console.log(pc.dim("\nThis ran real synthetic calls through your actual retries()/budget()/secrets()/pii()/validation() config -- not a mock of what they'd do."))
}
