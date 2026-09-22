import type { Middleware } from "../types.js"
import { deepRedact, type RedactionRule } from "./redact-utils.js"
import { sendTelemetry } from "../telemetry/send.js"

export interface VulnSignatureOptions {
  /**
   * Always "flag" in effect -- there is no "mask"/"block" mode for this
   * middleware, unlike pii()/secrets(). Redacting a vulnerable package
   * name (e.g. in a code-review call) would hide the exact information a
   * customer needs to act on; this middleware only ever annotates, never
   * alters, the call.
   */
  _reserved?: never
}

// Deliberately a small, honestly-scoped list of literal, well-known
// critical-CVE name+version-range patterns -- NOT a general SCA/CVE-range
// engine. No live vulnerable-package feed is wired into maskea today
// (Sentinel's CISA KEV client, a separate product/repo, isn't shared
// cross-repo) -- claiming broader coverage than this would misrepresent
// what actually runs. Expand this list deliberately over time, the same
// way SECRET_RULES in secrets.ts stays narrow/high-confidence on purpose.
const VULN_SIGNATURE_RULES: RedactionRule[] = [
  // Log4Shell (CVE-2021-44228) and the immediate follow-on CVEs patched by
  // 2.17.1 -- matches a log4j-core dependency declaration naming any
  // affected 2.x version.
  {
    name: "log4j_log4shell",
    pattern: /log4j-core[@:\s"']*2\.(?:[0-9]|1[0-6])(?:\.\d+)?\b/gi,
    replacement: "",
    action: "flag",
  },
  // Spring4Shell (CVE-2022-22965) -- spring-core versions before the
  // patched 5.3.18/5.2.20.
  {
    name: "spring4shell",
    pattern: /spring-core[@:\s"']*5\.(?:2\.(?:1[0-9]|[0-9])|3\.(?:1[0-7]|[0-9]))\b/gi,
    replacement: "",
    action: "flag",
  },
]

export function vulnSignatures(_options: VulnSignatureOptions = {}): Middleware {
  sendTelemetry("middleware_vuln_signatures_enabled")

  return async (args, next, ctx) => {
    const { value, flagged } = deepRedact(args, VULN_SIGNATURE_RULES)
    if (flagged.length > 0) ctx.meta.vulnSignatureHits = flagged

    const result = await next(value as typeof args)

    const { flagged: flaggedResponse } = deepRedact(result, VULN_SIGNATURE_RULES)
    if (flaggedResponse.length > 0) ctx.meta.vulnSignatureHitsResponse = flaggedResponse

    return result
  }
}
