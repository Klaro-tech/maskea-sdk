import { exec } from "node:child_process"
import { createInterface } from "node:readline/promises"
import pc from "picocolors"
import { readJson, writeJson } from "../../storage/local-store.js"
import { sendTelemetry } from "../../telemetry/send.js"

const DEFAULT_API_BASE_URL = "https://maskea.services"
const DASHBOARD_URL = "https://maskea.services/maskea/cloud"

// Same minimal cross-platform browser opener as dashboard.ts -- kept
// local rather than extracted to a shared util for one five-line
// function, matching this CLI's own "reduce engineering work" bar.
function openBrowser(url: string): void {
  const platform = process.platform
  const command = platform === "darwin" ? `open "${url}"` : platform === "win32" ? `start "" "${url}"` : `xdg-open "${url}"`
  exec(command, (err) => {
    if (err) console.log(`Could not open a browser automatically — open ${url} manually.`)
  })
}

interface CloudLinkConfig {
  projectKey?: string
  projectName?: string
  linkedAt?: string
}

/**
 * `maskea cloud login` -- opens the Cloud dashboard in the default browser
 * per cloud-architecture.md §4 step 1. There's no CLI-side session to
 * establish here: workspace login only ever happens in the browser
 * (§3, "this is the ONLY place a human logs in; the SDK itself never
 * does") -- this command's whole job is getting the developer to that
 * page, not managing credentials locally.
 */
export function cloudLogin(): void {
  sendTelemetry("cloud_login", { cliCommand: "cloud login" })
  console.log(`Opening ${pc.cyan(DASHBOARD_URL)} — sign in, then create a project and copy its API key.`)
  console.log(pc.dim("Next: maskea cloud link --key <project-api-key>"))
  openBrowser(DASHBOARD_URL)
}

/**
 * `maskea cloud link` -- registers this directory for Cloud sync by
 * saving a project API key to .maskea/cloud.json, per §4 step 2. No
 * device-code/OAuth exchange (real, scoped-down v1 of the doc's flow):
 * the key is created in the dashboard (opened by `cloud login`) and
 * pasted here, either via --key or an interactive prompt -- the same
 * "manual apiKey config is the fallback" path the doc already documents
 * as acceptable for CI/environments without a browser.
 */
export async function cloudLink(options: { key?: string; apiUrl?: string }): Promise<void> {
  const apiBaseUrl = (options.apiUrl ?? DEFAULT_API_BASE_URL).replace(/\/+$/, "")

  let key = options.key
  if (!key) {
    const rl = createInterface({ input: process.stdin, output: process.stdout })
    key = (await rl.question("Paste your project API key (from the Cloud dashboard): ")).trim()
    rl.close()
  }

  if (!key) {
    console.log(`${pc.red("✗")} No key provided.`)
    return
  }

  // Real validation, not a format check -- POSTs to the actual sync
  // endpoint with an empty batch. verifyProjectKey runs before the
  // empty-batch check server-side, so a 401 here means a bad key and a
  // 400 means a valid key with nothing to sync yet -- both distinguish
  // cleanly from a network/config problem.
  try {
    const res = await fetch(`${apiBaseUrl}/api/maskea/cloud/sync`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key },
      body: JSON.stringify({ calls: [], spend: [] }),
      signal: AbortSignal.timeout(10000),
    })
    if (res.status === 401) {
      console.log(`${pc.red("✗")} That key was rejected — check it was copied in full from the dashboard.`)
      return
    }
  } catch (e) {
    console.log(`${pc.red("✗")} Could not reach ${apiBaseUrl} — ${e instanceof Error ? e.message : String(e)}`)
    return
  }

  const config: CloudLinkConfig = { projectKey: key, linkedAt: new Date().toISOString() }
  writeJson("cloud", config)
  sendTelemetry("cloud_project_connected", { cliCommand: "cloud link" })
  console.log(`${pc.green("✓")} Linked. Add ${pc.bold(".use(cloudSync())")} to your Maskea config to start syncing.`)
  console.log(pc.dim("Key saved to .maskea/cloud.json — make sure .maskea/ is gitignored."))
}

export function cloudStatus(): void {
  const config = readJson<CloudLinkConfig>("cloud", {})
  if (!config.projectKey) {
    console.log(`${pc.yellow("○")} Not linked. Run ${pc.bold("maskea cloud login")} then ${pc.bold("maskea cloud link")}.`)
    return
  }
  console.log(`${pc.green("✓")} Linked ${config.linkedAt ? `(since ${new Date(config.linkedAt).toLocaleString()})` : ""}`)
  console.log(pc.dim(`Key: ${config.projectKey.slice(0, 20)}...`))
}
