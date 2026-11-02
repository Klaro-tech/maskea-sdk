import { readJson } from "../storage/local-store.js";

export interface HoldOptions {
  /** What is being done, e.g. "export", "create-admin", "payout-change". */
  kind: string;
  /** Who asked for it (a user id or email). */
  actor: string;
  /** One line for the cancel email. Do not put data values in it. */
  summary: string;
  /** How long to wait before the action may run. Default 10 minutes, min 1 minute, max 24 hours. */
  delayMs?: number;
  /** If Nopea cannot be reached: "closed" (default) never runs the action, "open" runs it anyway. */
  failMode?: "open" | "closed";
  cloud?: { apiKey?: string; apiBaseUrl?: string };
  /** How often to check for a cancel. Default 15 s. */
  pollMs?: number;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

export interface HoldResult {
  allowed: boolean;
  /** released: waited and not cancelled. cancelled: the owner cancelled. unreachable: Nopea could not be reached. */
  reason: "released" | "cancelled" | "unreachable";
  id?: string;
}

/**
 * Dead-man switch: waits for the delay while the workspace owner can cancel from an emailed link. Resolves with
 * `allowed: true` only if the delay passed without a cancel. Nopea never runs your action; you do, after this resolves.
 * It never throws: a network failure follows `failMode`.
 */
export async function holdAction(options: HoldOptions): Promise<HoldResult> {
  const doFetch = options.fetch ?? globalThis.fetch;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const failResult = (): HoldResult => ({ allowed: options.failMode === "open", reason: "unreachable" });
  const key = options.cloud?.apiKey ?? readJson<{ projectKey?: string }>("cloud", {}).projectKey;
  if (!key) return failResult();
  const base = `${(options.cloud?.apiBaseUrl ?? "https://nopea.tech").replace(/\/+$/, "")}/api/maskea/cloud/holds`;
  const headers = { "content-type": "application/json", "x-api-key": key };
  let id: string;
  try {
    const res = await doFetch(base, {
      method: "POST", headers, signal: AbortSignal.timeout(8000),
      body: JSON.stringify({ kind: options.kind, actor: options.actor, summary: options.summary, delayMs: options.delayMs, failMode: options.failMode ?? "closed" }),
    });
    if (!res.ok) return failResult();
    const j = (await res.json()) as { id?: string; executeAt?: string };
    if (!j.id || !j.executeAt) return failResult();
    id = j.id;
  } catch { return failResult(); }

  const pollMs = Math.max(1000, options.pollMs ?? 15_000);
  let failures = 0;
  for (;;) {
    try {
      const res = await doFetch(`${base}/${id}`, { headers, signal: AbortSignal.timeout(8000) });
      if (!res.ok) throw new Error(String(res.status));
      const j = (await res.json()) as { status?: string };
      failures = 0;
      if (j.status === "cancelled") return { allowed: false, reason: "cancelled", id };
      if (j.status === "released") return { allowed: true, reason: "released", id };
    } catch {
      // A few failed polls are normal; give up after 5 in a row and follow failMode.
      if (++failures >= 5) return { ...failResult(), id };
    }
    await sleep(pollMs);
  }
}
