import { exec } from "node:child_process"
import pc from "picocolors"
import { startDashboardServer } from "../../dashboard/server.js"
import { sendTelemetry } from "../../telemetry/send.js"

// Cross-platform "open in default browser" without adding a dependency
// (the `open` npm package is the usual choice, but this CLI's whole
// ethos is minimal deps -- three known shell commands cover the three
// real platforms, and if none apply the URL is printed instead of
// silently failing).
function openBrowser(url: string): void {
  const platform = process.platform
  const command = platform === "darwin" ? `open "${url}"` : platform === "win32" ? `start "" "${url}"` : `xdg-open "${url}"`
  exec(command, (err) => {
    if (err) console.log(`Could not open a browser automatically — open ${url} manually.`)
  })
}

/**
 * `maskea dashboard` -- local only, no Maskea account, no data leaving this
 * machine. Deliberately does NOT show a "raw vs redacted" diff for
 * secrets/PII: the whole point of secrets()/pii() middleware is that the
 * raw sensitive value is never persisted anywhere, including
 * .maskea/logs.jsonl -- building a diff view would require storing the
 * exact thing the SDK exists to avoid storing. Shows which redaction
 * rule fired and how many matches instead, which is the honest version
 * of that feature given the data that actually (and correctly) exists.
 */
export function dashboard(port: number): void {
  sendTelemetry("dashboard_opened", { cliCommand: "dashboard" })
  const server = startDashboardServer(port)
  const url = `http://localhost:${port}`
  console.log(`${pc.bold("maskea dashboard")} running at ${pc.cyan(url)}`)
  console.log(pc.dim("Local only — reads .maskea/ directly, nothing leaves this machine. Ctrl+C to stop."))
  openBrowser(url)

  process.on("SIGINT", () => {
    server.close()
    process.exit(0)
  })
}
