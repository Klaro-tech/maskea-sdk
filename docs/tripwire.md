# Tripwire: know when a key is reading too much

Stolen API keys and OAuth tokens pass every login check. The only thing left to notice is behaviour: how much one
credential reads, and how fast. Tripwire counts rows per credential and tells you when it goes over a budget or touches
a honey record. **It starts in alert-only mode: nothing is ever slowed or blocked unless you choose that.**

```ts
import { createTripwire, createHoney } from "@nopeatech/maskea";

const honey = createHoney({ secret: process.env.HONEY_SECRET!, emailDomain: "tripwire.yourcompany.com" });

const tripwire = createTripwire({
  budget: { rows: 5000, windowMs: 60 * 60_000 },        // 5,000 rows per credential per hour
  perCredential: { nightly_export: { rows: 200_000, windowMs: 60 * 60_000 } },
  webhookUrl: process.env.SLACK_WEBHOOK_URL,             // a Slack incoming webhook works as is
  honey,
});

// Wrap any read. In alert mode it always returns the rows.
const customers = await tripwire.wrap(apiKey.id, () => db.customers.findMany({ take: 1000 }), { resource: "GET /customers" });
```

## Honey records
```ts
const fakeCustomers = honey.generate(5);  // insert these into your customers table once
```
They look like real customers, use an email address on a domain you control, and are recognised later with no lookup
table. If any returned row contains one, you get an alert at once, even under the volume budget, because no real user
or feature ever reads them. Keep `HONEY_SECRET` out of the database the honey lives in.

## What an alert contains
Credential id, the resource label you passed, rows used, the budget, the mode and the time. Never any row values.
Alerts of the same type for the same credential are limited to one per 15 minutes (`cooldownMs`).

## Modes
| Mode | Behaviour |
|---|---|
| `alert` (default) | Tells you. Never slows or blocks. |
| `slow` | `wrap` waits `slowDelayMs` before returning once over budget. |
| `block` | `wrap` throws `TripwireBlockedError` once over budget; call your own token-revoke code from `onAlert`. |

## Limits
- Counters live in one process's memory. With several servers each has its own counter, so set the budget per server.
- It cannot stop the first request or recover data already taken, and an attacker who stays under the budget is not caught.
- It does not replace a firewall or login protection.
