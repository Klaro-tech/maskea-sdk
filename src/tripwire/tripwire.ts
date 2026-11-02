import type { Honey } from "./honey.js";
import { readJson } from "../storage/local-store.js";

/**
 * Tripwire: limit and watch how much data one credential (API key, OAuth token, user) reads, and say so out loud when
 * it reads too much, too fast, or touches a honey record. Stolen keys pass every login check, so the only thing left
 * to notice is behaviour: volume and speed.
 *
 * DEFAULT IS ALERT ONLY. In "alert" mode nothing is ever slowed or blocked; the library just tells you. "slow" and
 * "block" exist for later and must be chosen on purpose.
 *
 * Alerts never contain data values: only the credential id, the resource label, counts and times.
 * Counters live in this process's memory. With several servers, each has its own counter, so set the budget per
 * server accordingly (a shared counter is future work).
 */
export type TripwireMode = "alert" | "slow" | "block";

export interface Budget { rows: number; windowMs: number }

export interface TripwireAlert {
  type: "volume" | "honey";
  credentialId: string;
  resource: string | null;
  /** Rows read in the current window (volume alerts). */
  used: number | null;
  budget: Budget | null;
  mode: TripwireMode;
  at: string;
  message: string;
  /** True for alerts produced by drill(): practice alerts, never real incidents. */
  drill?: boolean;
}

export interface TripwireOptions {
  /** Default budget for any credential, e.g. { rows: 5000, windowMs: 3_600_000 } = 5,000 rows an hour. */
  budget: Budget;
  /** Different budgets for specific credentials (a bulk-export job may need more). */
  perCredential?: Record<string, Budget>;
  mode?: TripwireMode;
  /** Called for every alert. Throwing inside it is caught and ignored. */
  onAlert?: (alert: TripwireAlert) => void | Promise<void>;
  /** POST every alert as JSON here. The body has a "text" field, so a Slack incoming-webhook URL works as is. */
  webhookUrl?: string;
  /** Minimum time between two alerts of the same type for the same credential. Default 15 minutes. */
  cooldownMs?: number;
  /**
   * Also send every alert to your Nopea Maskea Cloud dashboard (Team plan and above). With `{}` it uses the project key
   * saved by `maskea cloud link`; pass `apiKey` to use your own (for example from a CI secret).
   */
  cloud?: { apiKey?: string; apiBaseUrl?: string };
  /** Optional honey records detector, see createHoney(). */
  honey?: Honey;
  /** How long "slow" mode asks the caller to wait per call. Default 2000 ms. */
  slowDelayMs?: number;
  /** Injected for tests. */
  now?: () => number;
  fetch?: typeof fetch;
}

export interface Decision {
  action: "allow" | "alert" | "slow" | "block";
  used: number;
  budget: Budget;
  resetsInMs: number;
  delayMs?: number;
}

export interface ChannelResult { callback: boolean | null; webhook: boolean | null; cloud: boolean | null }
export interface DrillResult { drillId: string; channels: ChannelResult; allDelivered: boolean }

export class TripwireBlockedError extends Error {
  constructor(public readonly credentialId: string, public readonly decision: Decision) {
    super(`Tripwire: credential "${credentialId}" went over its data budget`);
    this.name = "TripwireBlockedError";
  }
}

interface Counter { windowStart: number; used: number }

export function createTripwire(options: TripwireOptions) {
  const mode = options.mode ?? "alert";
  const now = options.now ?? Date.now;
  const doFetch = options.fetch ?? globalThis.fetch;
  const cooldownMs = options.cooldownMs ?? 15 * 60_000;
  const counters = new Map<string, Counter>();
  const lastAlert = new Map<string, number>();

  const budgetFor = (id: string): Budget => options.perCredential?.[id] ?? options.budget;

  function prune(t: number) {
    if (counters.size < 10_000) return;
    for (const [k, c] of counters) if (t - c.windowStart > budgetFor(k).windowMs * 2) counters.delete(k);
    for (const [k, at] of lastAlert) if (t - at > cooldownMs * 2) lastAlert.delete(k);
  }

  /** Sends one alert to every configured channel. Each result is true (delivered), false (failed) or null (not configured). */
  async function deliver(alert: TripwireAlert): Promise<ChannelResult> {
    const out: ChannelResult = { callback: null, webhook: null, cloud: null };
    if (options.onAlert) {
      try { await options.onAlert(alert); out.callback = true; } catch { out.callback = false; /* an alert handler must never break the app */ }
    }
    if (options.cloud) {
      try {
        const key = options.cloud.apiKey ?? readJson<{ projectKey?: string }>("cloud", {}).projectKey;
        if (key) {
          const res = await doFetch(`${(options.cloud.apiBaseUrl ?? "https://nopea.tech").replace(/\/+$/, "")}/api/maskea/cloud/tripwire`, {
            method: "POST",
            headers: { "content-type": "application/json", "x-api-key": key },
            body: JSON.stringify({ alert }),
            signal: AbortSignal.timeout(5000),
          });
          out.cloud = res.ok;
        } else out.cloud = false;
      } catch { out.cloud = false; /* dashboard delivery is best effort */ }
    }
    if (options.webhookUrl) {
      try {
        const res = await doFetch(options.webhookUrl, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ text: `Tripwire${alert.drill ? " DRILL" : ""}: ${alert.message}`, alert }),
          signal: AbortSignal.timeout(5000),
        });
        out.webhook = res.ok;
      } catch { out.webhook = false; }
    }
    return out;
  }

  function maybeAlert(alert: TripwireAlert): void {
    const key = `${alert.type}:${alert.credentialId}`;
    const t = now();
    if (t - (lastAlert.get(key) ?? -Infinity) < cooldownMs) return;
    lastAlert.set(key, t);
    void deliver(alert);
  }

  /** Count `rows` read by `credentialId` and decide. Never throws. */
  function record(credentialId: string, rows: number, meta: { resource?: string } = {}): Decision {
    const t = now();
    prune(t);
    const budget = budgetFor(credentialId);
    let c = counters.get(credentialId);
    if (!c || t - c.windowStart >= budget.windowMs) { c = { windowStart: t, used: 0 }; counters.set(credentialId, c); }
    c.used += Math.max(0, Math.floor(rows));
    const resetsInMs = Math.max(0, c.windowStart + budget.windowMs - t);
    if (c.used <= budget.rows) return { action: "allow", used: c.used, budget, resetsInMs };

    maybeAlert({
      type: "volume", credentialId, resource: meta.resource ?? null, used: c.used, budget, mode, at: new Date(t).toISOString(),
      message: `credential "${credentialId}" read ${c.used} rows in ${Math.round((t - c.windowStart) / 1000)}s (limit ${budget.rows} per ${Math.round(budget.windowMs / 60000)} min)${meta.resource ? ` from ${meta.resource}` : ""}`,
    });
    if (mode === "block") return { action: "block", used: c.used, budget, resetsInMs };
    if (mode === "slow") return { action: "slow", used: c.used, budget, resetsInMs, delayMs: options.slowDelayMs ?? 2000 };
    return { action: "alert", used: c.used, budget, resetsInMs };
  }

  /** Look inside rows about to be returned for honey values. Returns true (and alerts at once) if one is there. */
  function inspect(credentialId: string, rows: unknown, meta: { resource?: string } = {}): boolean {
    if (!options.honey || !options.honey.scan(rows)) return false;
    maybeAlert({
      type: "honey", credentialId, resource: meta.resource ?? null, used: null, budget: null, mode, at: new Date(now()).toISOString(),
      message: `credential "${credentialId}" read a honey record${meta.resource ? ` from ${meta.resource}` : ""}. No real user or feature reads these, so treat this credential as compromised`,
    });
    return true;
  }

  /**
   * Wrap a read: runs `read`, counts the rows it returns (arrays count by length, anything else counts as 1), checks for
   * honey values, and applies the mode. In "alert" mode it always returns the rows.
   */
  async function wrap<T>(credentialId: string, read: () => Promise<T>, meta: { resource?: string } = {}): Promise<T> {
    const result = await read();
    const rows = Array.isArray(result) ? result.length : 1;
    inspect(credentialId, result, meta);
    const d = record(credentialId, rows, meta);
    if (d.action === "block") throw new TripwireBlockedError(credentialId, d);
    if (d.action === "slow" && d.delayMs) await new Promise((r) => setTimeout(r, d.delayMs));
    return result;
  }

  /**
   * Practice run: sends a clearly labelled DRILL alert (and a honey one if honey is configured) through every channel and
   * reports which channels delivered. Ignores the cooldown. Use it weekly: an alarm nobody has tested is not a control.
   */
  async function drill(drillId: string = Math.random().toString(36).slice(2, 10)): Promise<DrillResult> {
    const credentialId = `drill:${drillId}`;
    const budget = options.budget;
    const at = new Date(now()).toISOString();
    const volume: TripwireAlert = { type: "volume", credentialId, resource: "drill", used: budget.rows + 1, budget, mode, at, drill: true,
      message: `DRILL: practice alert for "${credentialId}" (simulated read over the ${budget.rows}-row budget). No real data was read` };
    const results = [await deliver(volume)];
    if (options.honey) {
      results.push(await deliver({ type: "honey", credentialId, resource: "drill", used: null, budget: null, mode, at, drill: true,
        message: `DRILL: practice honey-record alert for "${credentialId}". No real data was read` }));
    }
    const merge = (k: keyof ChannelResult): boolean | null => {
      const vals = results.map((r) => r[k]).filter((v) => v !== null) as boolean[];
      return vals.length ? vals.every(Boolean) : null;
    };
    const channels: ChannelResult = { callback: merge("callback"), webhook: merge("webhook"), cloud: merge("cloud") };
    const configured = Object.values(channels).filter((v) => v !== null) as boolean[];
    return { drillId, channels, allDelivered: configured.length > 0 && configured.every(Boolean) };
  }

  return { record, inspect, wrap, drill, mode };
}

export type Tripwire = ReturnType<typeof createTripwire>;
