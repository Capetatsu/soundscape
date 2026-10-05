# Verification harness

Real-browser verification for Soundscape. These are not unit tests with mocks: they drive a
running production build in Chromium and assert on genuine playback, so they need network
access to the open catalogues (Audius, Jamendo, Internet Archive, Radio Browser).

## Prerequisites

1. A Chromium build for Playwright:

   ```sh
   npx playwright install chromium
   ```

   The suites import `playwright-core`, which resolves the browser from the standard
   Playwright cache (`%LOCALAPPDATA%\ms-playwright` on Windows).

2. A running production build (the suites assert against the built app, not the dev server):

   ```sh
   npm run build
   $env:NODE_ENV='production'; npx tsx server.ts     # PowerShell
   ```

   Then confirm `http://127.0.0.1:3000/healthz` responds.

## Running

```sh
npm run test:e2e          # 30 checks — full acceptance pass
npm run test:resilience   # 9 checks  — provider outage / offline / unreachable server
npm run test:providers    # per-provider playback + Archive honesty
npm run test:jamendo      # FLAC truth + first-play reliability rate
npm run test:all          # everything above, in order
```

Point the suites at a different host with `SOUNDSCAPE_BASE_URL`:

```sh
SOUNDSCAPE_BASE_URL=https://soundscape.example.com npm run test:e2e
```

Screenshots and run artifacts are written to `tests/.output/` (git-ignored).

## Layout

```
tests/
├── e2e/master-e2e.mjs              30-check acceptance pass
├── resilience/resilience.mjs        9 checks — failures must not break the app
├── providers/provider-coverage.mjs  one track played per free provider
├── providers/archive-honesty.mjs    Archive names the real format + caveat
├── jamendo/flac-truth.mjs           lossless claim matches the served stream
├── jamendo/first-play-rate.mjs      repeated first-play reliability
├── fixtures/make-fixture.mjs        generates the local-file fixture (no encoder needed)
└── lib/harness.mjs                  shared paths, reporter, helpers
```

## Local-file fixture

`resolveLocalFixture()` prefers, in order:

1. `tests/fixtures/fixture-test.flac`
2. `tests/fixtures/fixture-test.mp3`
3. `tests/fixtures/fixture-5s.wav` — generated on demand by `fixtures/make-fixture.mjs`

Only the generated WAV is produced on a fresh clone, so the repository carries no binary
blobs and no encoder dependency. Soundscape's local playback path is container-agnostic
(File API → blob URL → `<audio>` → DSP chain), so container decoding is Chromium's job
rather than the app's. To additionally exercise lossless input, drop a real file at
`tests/fixtures/fixture-test.flac` — it is picked up with no code change.

## Interpreting results

- Checks that fail print the observed value in the detail column, e.g. `clock=131s`.
- A failing suite sets a non-zero exit code, so CI can gate on it.
- Third-party outages (a dead Audius node, a station favicon returning 402, LRCLIB 404) are
  **not** treated as app failures — the app handles those with visible fallbacks, and the
  suites assert on that fallback instead.
- Jamendo's free tier returns an empty result set for roughly half of all identical requests.
  That is upstream behaviour; the suites therefore measure reliability over repeated attempts
  rather than trusting a single sample.
