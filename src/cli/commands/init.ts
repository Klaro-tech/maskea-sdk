import { existsSync, writeFileSync } from "node:fs"
import { join, basename } from "node:path"
import pc from "picocolors"
import { getOrCreateProject, isTelemetryEnabled } from "../../telemetry/identity.js"
import { sendTelemetry } from "../../telemetry/send.js"

const TEMPLATE = `import { Maskea, retries, budget, secrets, pii, logging } from "@maskea/sdk";

// Scaffolded by \`maskea init\`. No cloud account needed -- everything here
// runs locally. Import \`maskea\` wherever you currently call your provider
// SDK directly, and wrap the call: export const chat = maskea.wrap(openai.chat.completions.create).
export const maskea = new Maskea()
  .use(retries({ max: 3, backoff: "exponential" }))
  .use(budget({ maxMonthlyUsd: 50 }))
  .use(secrets({ mode: "mask" }))
  .use(pii({ mode: "mask", types: ["email", "phone", "ssn", "credit_card"] }))
  .use(logging({ format: "pretty" }));
`

export function init(): void {
  const path = join(process.cwd(), "maskea.config.ts")
  if (existsSync(path)) {
    console.log(`${pc.yellow("⚠")} maskea.config.ts already exists — not overwriting.`)
    return
  }
  writeFileSync(path, TEMPLATE, "utf8")
  console.log(`${pc.green("✓")} Created maskea.config.ts`)

  getOrCreateProject(basename(process.cwd()))
  sendTelemetry("project_created")

  console.log(pc.bold("\nNext step — wrap your existing AI call:\n"))
  console.log(pc.cyan("  import { maskea } from \"./maskea.config\";"))
  console.log(pc.cyan("  const chat = maskea.wrap(openai.chat.completions.create.bind(openai.chat.completions));"))
  console.log(pc.dim("\nNo account, no API key, no cloud dependency required to use any of this."))

  if (isTelemetryEnabled()) {
    console.log(pc.dim("\nAnonymous usage statistics help improve maskea."))
    console.log(pc.dim("No prompts, responses, secrets or PII are ever sent."))
    console.log(pc.dim("Disable anytime: npx maskea telemetry disable"))
  }
}
