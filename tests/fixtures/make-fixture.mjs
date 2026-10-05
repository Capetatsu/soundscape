// Generates the local-file test fixture: 5s stereo 16-bit PCM WAV, 440 Hz sine with
// 100 ms fades. Pure Node (no encoder, no dependency), so a fresh clone can create it
// without committing a binary blob.
//
// Standalone by design: it imports nothing from the harness, so there is no import cycle.
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const FIXTURES_DIR = join(dirname(fileURLToPath(import.meta.url)));

const SR = 44100;
const SEC = 5;
const N = SR * SEC;

function build() {
  const buf = Buffer.alloc(44 + N * 2 * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + N * 4, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 4, 28);
  buf.writeUInt16LE(4, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(N * 4, 40);
  for (let i = 0; i < N; i++) {
    const t = i / SR;
    const fade = Math.min(1, i / (SR * 0.1), (N - i) / (SR * 0.1));
    const v = Math.round(Math.sin(2 * Math.PI * 440 * t) * 32767 * 0.5 * fade);
    buf.writeInt16LE(v, 44 + i * 4);
    buf.writeInt16LE(v, 44 + i * 4 + 2);
  }
  return buf;
}

export const FIXTURE_PATH = join(FIXTURES_DIR, 'fixture-5s.wav');

/** Write the fixture if missing. Returns its path. */
export function ensureLocalFixture() {
  try {
    mkdirSync(FIXTURES_DIR, { recursive: true });
    writeFileSync(FIXTURE_PATH, build());
  } catch {
    /* unwritable directory — the caller reports the missing fixture honestly */
  }
  return FIXTURE_PATH;
}

// Run directly: node tests/fixtures/make-fixture.mjs
if (process.argv[1] && process.argv[1].endsWith('make-fixture.mjs')) {
  const buf = build();
  mkdirSync(FIXTURES_DIR, { recursive: true });
  writeFileSync(FIXTURE_PATH, buf);
  console.log('fixture written:', FIXTURE_PATH, buf.length, 'bytes');
}
