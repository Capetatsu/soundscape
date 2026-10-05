// Shared helpers for the Soundscape verification harness.
// Everything resolves paths relative to THIS FILE, so the suite runs from a fresh clone
// with no machine-specific absolute paths.
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';
import { ensureLocalFixture } from '../fixtures/make-fixture.mjs';

// tests/lib/  ->  tests/  ->  repo root
export const TESTS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const REPO_ROOT = resolve(TESTS_DIR, '..');
export const FIXTURES_DIR = join(TESTS_DIR, 'fixtures');

// Screenshots and traces are run artifacts, never committed.
export const OUTPUT_DIR = process.env.SOUNDSCAPE_TEST_OUTPUT || join(TESTS_DIR, '.output');
export function outputDir() {
  mkdirSync(OUTPUT_DIR, { recursive: true });
  return OUTPUT_DIR;
}
export const shotPath = (name) => join(outputDir(), name);

// Base URL of a running server. Override with SOUNDSCAPE_BASE_URL.
export const BASE = (process.env.SOUNDSCAPE_BASE_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');

// Chromium flags used by every suite: allow autoplay without a gesture, mute output.
export const CHROMIUM_ARGS = ['--autoplay-policy=no-user-gesture-required', '--mute-audio'];

/**
 * Pick a local-file fixture for the "play a file from this device" checks.
 *
 * Preference order lets a developer drop in a real lossless/compressed file without editing
 * any test: fixture-test.flac > fixture-test.mp3 > fixture-5s.wav (auto-generated).
 *
 * On a fresh clone only the generated PCM WAV exists. That is deliberate: no FLAC/MP3 encoder
 * ships with the repo and adding one purely for a fixture would be a new dependency. The local
 * playback path in Soundscape is container-agnostic (File API -> blob URL -> <audio> -> DSP
 * chain), so container decoding is Chromium's responsibility, not the app's. Drop a real
 * fixture-test.flac into tests/fixtures/ to additionally exercise lossless input.
 */
export function resolveLocalFixture() {
  for (const name of ['fixture-test.flac', 'fixture-test.mp3', 'fixture-5s.wav']) {
    const p = join(FIXTURES_DIR, name);
    if (existsSync(p)) return p;
  }
  return ensureLocalFixture();
}

/** Console/page errors caused by the app itself (not by third-party hosts being down). */
export const isAppError = (text) =>
  /pageerror|Content Security Policy|TypeError|ReferenceError|SyntaxError|Soundscape/i.test(text) &&
  !/sdk\.scdn/.test(text);

/** Collects pass/fail results and prints the standard summary. */
export function createReporter(suiteName, total) {
  const results = [];
  const pass = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log((ok ? 'PASS' : 'FAIL'), '-', name, detail);
  };
  const finish = () => {
    const failed = results.filter((r) => !r.ok);
    console.log(`\n=== ${suiteName}: ${results.length - failed.length}/${results.length} passed ===`);
    if (total && total !== results.length) {
      console.log(`NOTE: expected ${total} checks, recorded ${results.length}`);
    }
    if (failed.length) console.log('FAILED:', JSON.stringify(failed, null, 1));
    if (failed.length) process.exitCode = 1;
  };
  return { pass, finish, results };
}

/**
 * Assert the Jamendo client id is never rendered in the UI.
 * Reads the value from the environment when available instead of hardcoding it, so the
 * harness never has to contain the real key.
 */
export function jamendoKeyLeakRegex() {
  const fromEnv = process.env.VITE_JAMENDO_CLIENT_ID || process.env.SOUNDSCAPE_JAMENDO_CLIENT_ID;
  if (fromEnv && fromEnv.length >= 8) return new RegExp(fromEnv.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  // Fallback: the key is a lowercase hex token; also catch an explicit assignment.
  return /client_id\s*[:=]\s*["']?[0-9a-z]{8,}|\b[0-9a-f]{10,}\b/i;
}
