import { existsSync, mkdirSync, readFileSync, appendFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

// Everything lands in ./.maskea relative to cwd -- same convention as
// .git/.next/.turbo. No cloud call, no account, works the moment the SDK
// is installed. This is the entire "local logging + cost estimation"
// storage layer; Maskea Cloud (a separate, optional service) can later sync
// this directory's contents up, but nothing here requires that to exist.
const KLARO_DIR = ".maskea"

function ensureDir(): string {
  const dir = join(process.cwd(), KLARO_DIR)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

/** Appends one JSON line to .maskea/<file>.jsonl -- used by logging() and budget()'s spend ledger. Append-only so concurrent processes (e.g. two Node workers) never corrupt each other's writes. */
export function appendJsonLine(file: string, record: unknown): void {
  const dir = ensureDir()
  appendFileSync(join(dir, `${file}.jsonl`), JSON.stringify(record) + "\n", "utf8")
}

/** Reads every JSON line back -- used by `maskea stats`/`maskea inspect` and by budget()'s running-total calculation. Corrupt/partial trailing lines (e.g. a process killed mid-write) are skipped rather than failing the whole read. Never creates .maskea/ as a side effect -- a read that finds nothing should report nothing exists yet, not silently create the directory (doctor's ".maskea/ local storage" check depends on this). */
export function readJsonLines<T = unknown>(file: string): T[] {
  const dir = join(process.cwd(), KLARO_DIR)
  const path = join(dir, `${file}.jsonl`)
  if (!existsSync(path)) return []
  const raw = readFileSync(path, "utf8")
  const out: T[] = []
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue
    try {
      out.push(JSON.parse(line) as T)
    } catch {
      // partial/corrupt line -- skip, don't crash the whole read
    }
  }
  return out
}

/** Small key-value store for things that aren't append-only logs (e.g. the resolved config from `maskea init`). */
export function readJson<T>(file: string, fallback: T): T {
  const dir = join(process.cwd(), KLARO_DIR)
  const path = join(dir, `${file}.json`)
  if (!existsSync(path)) return fallback
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T
  } catch {
    return fallback
  }
}

export function writeJson(file: string, value: unknown): void {
  const dir = ensureDir()
  writeFileSync(join(dir, `${file}.json`), JSON.stringify(value, null, 2), "utf8")
}
