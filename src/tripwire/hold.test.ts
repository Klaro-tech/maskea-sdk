import { test } from "vitest";
import assert from "node:assert/strict";
import { holdAction } from "./hold.js";

const json = (b: unknown, ok = true) => ({ ok, status: ok ? 200 : 500, json: async () => b }) as Response;
const base = { kind: "export", actor: "a", summary: "s", cloud: { apiKey: "k" }, pollMs: 1000, sleep: async () => {} };

test("released when the delay passes without a cancel", async () => {
  const seq = [json({ id: "h1", executeAt: new Date().toISOString() }), json({ status: "held" }), json({ status: "released" })];
  const r = await holdAction({ ...base, fetch: (async () => seq.shift()!) as typeof fetch });
  assert.deepEqual(r, { allowed: true, reason: "released", id: "h1" });
});
test("cancelled by the owner", async () => {
  const seq = [json({ id: "h1", executeAt: "x" }), json({ status: "cancelled" })];
  const r = await holdAction({ ...base, fetch: (async () => seq.shift()!) as typeof fetch });
  assert.equal(r.allowed, false); assert.equal(r.reason, "cancelled");
});
test("service down follows failMode", async () => {
  const down = (async () => { throw new Error("down"); }) as typeof fetch;
  assert.equal((await holdAction({ ...base, fetch: down })).allowed, false);
  assert.equal((await holdAction({ ...base, failMode: "open", fetch: down })).allowed, true);
});
test("polls failing after the hold was created follow failMode", async () => {
  let n = 0;
  const f = (async () => { if (n++ === 0) return json({ id: "h1", executeAt: "x" }); throw new Error("down"); }) as typeof fetch;
  const r = await holdAction({ ...base, fetch: f });
  assert.equal(r.allowed, false); assert.equal(r.reason, "unreachable");
});
