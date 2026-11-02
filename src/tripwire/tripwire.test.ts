import { describe, expect, it, vi } from "vitest";
import { createHoney } from "./honey.js";
import { createTripwire, TripwireBlockedError, type TripwireAlert } from "./tripwire.js";

const budget = { rows: 100, windowMs: 60_000 };
const clock = () => { let t = 1_000_000; return { now: () => t, advance: (ms: number) => { t += ms; } }; };

describe("volume budget", () => {
  it("allows reads under the budget and alerts once when it is passed, in alert mode never blocking", async () => {
    const c = clock(); const alerts: TripwireAlert[] = [];
    const tw = createTripwire({ budget, now: c.now, onAlert: (a) => { alerts.push(a); } });
    expect(tw.record("key_1", 60).action).toBe("allow");
    expect(tw.record("key_1", 60).action).toBe("alert");
    expect(tw.record("key_1", 500).action).toBe("alert"); // still alert, never block
    await Promise.resolve();
    expect(alerts).toHaveLength(1); // cooldown: one alert, not three
    expect(alerts[0]).toMatchObject({ type: "volume", credentialId: "key_1", used: 120, mode: "alert" });
  });
  it("keeps credentials separate and resets after the window", () => {
    const c = clock(); const tw = createTripwire({ budget, now: c.now });
    expect(tw.record("a", 100).action).toBe("allow");
    expect(tw.record("b", 100).action).toBe("allow");
    expect(tw.record("a", 1).action).toBe("alert");
    c.advance(60_001);
    expect(tw.record("a", 50).action).toBe("allow");
  });
  it("supports a bigger budget for a named credential", () => {
    const tw = createTripwire({ budget, perCredential: { export_job: { rows: 10_000, windowMs: 60_000 } } });
    expect(tw.record("export_job", 5000).action).toBe("allow");
    expect(tw.record("someone", 5000).action).toBe("alert");
  });
  it("block and slow modes act only when chosen", async () => {
    const block = createTripwire({ budget, mode: "block" });
    await expect(block.wrap("k", async () => Array.from({ length: 200 }, (_, i) => ({ i })))).rejects.toBeInstanceOf(TripwireBlockedError);
    const slow = createTripwire({ budget, mode: "slow", slowDelayMs: 1 });
    expect((await slow.wrap("k", async () => Array.from({ length: 200 }, () => 1))).length).toBe(200);
  });
  it("wrap returns the rows untouched in alert mode", async () => {
    const tw = createTripwire({ budget });
    const rows = Array.from({ length: 500 }, (_, i) => ({ i }));
    expect(await tw.wrap("k", async () => rows)).toBe(rows);
  });
});

describe("alert delivery", () => {
  it("posts JSON with a text field (Slack-compatible), carries no data values, and survives a failing endpoint", async () => {
    const fetchMock = vi.fn(async () => new Response("ok"));
    const tw = createTripwire({ budget, webhookUrl: "https://hooks.slack.com/x", fetch: fetchMock as any });
    tw.record("key_1", 1000, { resource: "GET /customers" });
    await new Promise((r) => setTimeout(r, 0));
    const body = JSON.parse((fetchMock.mock.calls[0] as any)[1].body);
    expect(body.text).toContain("key_1");
    expect(JSON.stringify(body)).not.toMatch(/@/);
    const bad = createTripwire({ budget, webhookUrl: "https://x", fetch: (async () => { throw new Error("down"); }) as any, onAlert: () => { throw new Error("handler bug"); } });
    expect(() => bad.record("k", 1000)).not.toThrow();
  });
});

describe("honey records", () => {
  const honey = createHoney({ secret: "a-long-secret-value-123", emailDomain: "tripwire.acme.com" });
  it("generated records are recognised and look like customers", () => {
    const recs = honey.generate(3);
    expect(recs).toHaveLength(3);
    expect(recs.every((r) => honey.isHoney(r.email) && r.email.endsWith("@tripwire.acme.com"))).toBe(true);
  });
  it("rejects look-alikes with a wrong signature or another secret", () => {
    const [r] = honey.generate(1);
    expect(honey.isHoney(r.email.replace(/-[a-f0-9]{10}@/, "-0000000000@"))).toBe(false);
    expect(createHoney({ secret: "another-secret-value-456", emailDomain: "tripwire.acme.com" }).isHoney(r.email)).toBe(false);
    expect(honey.isHoney("real.person@acme.com")).toBe(false);
  });
  it("alerts immediately when a honey record is inside returned rows, even under the volume budget", async () => {
    const alerts: TripwireAlert[] = [];
    const tw = createTripwire({ budget, honey, onAlert: (a) => { alerts.push(a); } });
    const [h] = honey.generate(1);
    const rows = [{ id: 1, email: "real@acme.com" }, { id: 2, nested: { contact: h.email } }];
    expect(tw.inspect("key_9", rows, { resource: "GET /customers" })).toBe(true);
    expect(tw.inspect("key_9", [{ email: "real@acme.com" }])).toBe(false);
    await Promise.resolve();
    expect(alerts[0]).toMatchObject({ type: "honey", credentialId: "key_9" });
    expect(alerts[0].message).not.toContain(h.email);
  });
  it("needs a real secret", () => {
    expect(() => createHoney({ secret: "short", emailDomain: "x.com" })).toThrow();
  });
});

describe("cloud dashboard delivery", () => {
  it("posts the alert to the Nopea endpoint with the project key and still works if it fails", async () => {
    const calls: any[] = [];
    const tw = createTripwire({ budget, cloud: { apiKey: "maskea_proj_abc" }, fetch: (async (u: string, i: any) => { calls.push([u, i]); return new Response("{}"); }) as any });
    tw.record("key_1", 1000);
    await new Promise((r) => setTimeout(r, 0));
    expect(calls[0][0]).toBe("https://nopea.tech/api/maskea/cloud/tripwire");
    expect(calls[0][1].headers["x-api-key"]).toBe("maskea_proj_abc");
    expect(JSON.parse(calls[0][1].body).alert.credentialId).toBe("key_1");
    const bad = createTripwire({ budget, cloud: { apiKey: "k" }, fetch: (async () => { throw new Error("down"); }) as any });
    expect(() => bad.record("x", 1000)).not.toThrow();
  });
});
