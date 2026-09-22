import { defineConfig } from "vitest/config"

// Every test file's beforeEach/afterEach reads and rmSync's the SAME
// .maskea/ directory (relative to process.cwd(), which local-store.ts
// hardcodes -- correct for the real SDK, but means test files racing in
// parallel can rmSync a directory another file is mid-write to).
// Confirmed live: an intermittent failure in explain.test.ts that
// disappeared on rerun, classic parallel-race signature. Disabling file
// parallelism trades a small amount of speed (this suite runs in well
// under a second either way) for eliminating the whole bug class, rather
// than restructuring every test file to use an isolated cwd.
export default defineConfig({
  test: {
    fileParallelism: false,
    // Every retries()/budget()/secrets()/pii()/validation() construction
    // fires a telemetry ping by design (see src/telemetry). Without this,
    // the test suite -- which constructs dozens of these per run -- would
    // silently hit the real production telemetry endpoint on every
    // `vitest run`, including on every contributor's machine and every CI
    // run. Found live: ran the suite once before adding this and confirmed
    // outbound fetches were firing. KLARO_TELEMETRY=0 always wins over
    // config, so this fully suppresses it; telemetry.test.ts overrides
    // this per-test where it specifically needs to exercise the opt-in path.
    env: { KLARO_TELEMETRY: "0" },
  },
})
