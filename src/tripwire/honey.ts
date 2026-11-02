import { createHmac, randomBytes } from "node:crypto";

/**
 * Honey records: fake customers that no real user or feature ever touches. Each carries an email address that proves
 * it is a honey record without any lookup table (a short HMAC of its random part), so detection needs no storage and
 * works even if the attacker only keeps the email column. Use an `emailDomain` you control, so mail sent to a honey
 * address (or its appearance in a leak) can be noticed.
 */
export interface HoneyOptions {
  /** Secret used to sign honey values. Keep it out of the database the records live in. */
  secret: string;
  /** A domain you control, for example "tripwire.yourcompany.com". */
  emailDomain: string;
}

export interface HoneyRecord { id: string; name: string; email: string; createdAt: string }

const FIRST = ["Alex", "Sam", "Jordan", "Taylor", "Morgan", "Casey", "Riley", "Jamie", "Avery", "Quinn"];
const LAST = ["Rivera", "Nguyen", "Okafor", "Lindqvist", "Haddad", "Moreau", "Tanaka", "Silva", "Kowalski", "Mehta"];

export function createHoney(options: HoneyOptions) {
  if (!options.secret || options.secret.length < 16) throw new Error("honey secret must be at least 16 characters");
  const domain = options.emailDomain.toLowerCase();
  const mac = (nonce: string) => createHmac("sha256", options.secret).update(nonce).digest("hex").slice(0, 10);
  const emailRe = new RegExp(`hp-([a-f0-9]{12})-([a-f0-9]{10})@${domain.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i");

  /** Is this string (an email, or text containing one) one of our honey addresses? */
  function isHoney(value: string): boolean {
    const m = value.match(emailRe);
    return !!m && mac(m[1].toLowerCase()) === m[2].toLowerCase();
  }

  /** Make `count` fake customer records to insert into your own database. Their ids are random and look like real ones. */
  function generate(count: number): HoneyRecord[] {
    const out: HoneyRecord[] = [];
    for (let i = 0; i < count; i++) {
      const nonce = randomBytes(6).toString("hex");
      const name = `${FIRST[randomBytes(1)[0] % FIRST.length]} ${LAST[randomBytes(1)[0] % LAST.length]}`;
      out.push({ id: randomBytes(8).toString("hex"), name, email: `hp-${nonce}-${mac(nonce)}@${domain}`, createdAt: new Date().toISOString() });
    }
    return out;
  }

  /** Walk rows (objects, arrays, strings, depth-limited) and report whether any honey value is inside. */
  function scan(rows: unknown, depth = 4): boolean {
    if (typeof rows === "string") return rows.length < 4000 && isHoney(rows);
    if (depth <= 0 || rows === null || typeof rows !== "object") return false;
    for (const v of Array.isArray(rows) ? rows : Object.values(rows as Record<string, unknown>)) if (scan(v, depth - 1)) return true;
    return false;
  }

  return { generate, isHoney, scan };
}

export type Honey = ReturnType<typeof createHoney>;
