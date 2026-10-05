// Generates tests/fixtures/fixture-test.flac — a genuine, lossless FLAC file containing
// SYNTHETIC audio (a decaying sine tone), so it is safe to redistribute.
//
// Why this exists rather than a committed binary blob from elsewhere: no FLAC encoder is
// available in this environment (no ffmpeg/flac/sox, and Python has no soundfile), and
// adding a heavyweight encoder dependency purely to mint one test fixture is not worth it.
// FLAC's simplest lossless modes are straightforward to emit directly, so this writes a
// spec-compliant stream using STREAMINFO + VORBIS_COMMENT and FIXED-predictor subframes
// with Rice-coded residuals. Lossless by construction: the decoder reconstructs the exact
// input samples.
//
// This is a one-shot developer tool. The generated .flac is committed, so a fresh clone
// never needs to run this.
//
//   node tests/fixtures/make-flac-fixture.mjs

import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const OUT = join(dirname(fileURLToPath(import.meta.url)), 'fixture-test.flac');

const SAMPLE_RATE = 44100;
const CHANNELS = 1; // mono keeps the encoder small; FLAC channel handling is unchanged
const BPS = 16;
const BLOCK = 4096;
// 10s, not 3s: the local-file checks upload the file, wait, then assert that it is PLAYING.
// A short clip finishes inside that window and the assertion would see a stopped player.
const SECONDS = 10;

// ---------- CRC (per FLAC spec) ----------
const crc8 = (bytes) => {
  let crc = 0;
  for (const b of bytes) {
    crc ^= b;
    for (let i = 0; i < 8; i++) crc = crc & 0x80 ? ((crc << 1) ^ 0x07) & 0xff : (crc << 1) & 0xff;
  }
  return crc;
};
const crc16 = (bytes) => {
  let crc = 0;
  for (const b of bytes) {
    crc ^= b << 8;
    for (let i = 0; i < 8; i++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x8005) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc;
};

// ---------- bit writer (frame data is MSB-first; Rice remainders are LSB-first) ----------
class BitWriter {
  constructor() { this.bytes = []; this.cur = 0; this.n = 0; }
  bits(value, count) { for (let i = count - 1; i >= 0; i--) this.#push((value >> i) & 1); }
  #push(bit) {
    this.cur = (this.cur << 1) | (bit & 1);
    if (++this.n === 8) { this.bytes.push(this.cur & 0xff); this.cur = 0; this.n = 0; }
  }
  unary(q) { // q zero bits then a single 1 bit
    while (q >= 32) { for (let i = 0; i < 32; i++) this.#push(0); q -= 32; }
    for (let i = 0; i < q; i++) this.#push(0);
    this.#push(1);
  }
  riceRemainder(value, k) { for (let i = 0; i < k; i++) this.#push((value >> i) & 1); }
  align() { if (this.n) { this.cur <<= 8 - this.n; this.bytes.push(this.cur & 0xff); this.cur = 0; this.n = 0; } }
  bytes_out() { this.align(); return this.bytes; }
}

// ---------- synthetic PCM ----------
function makeSamples(total) {
  const out = new Int32Array(total); // keep residuals exact; cast to 16-bit on write
  for (let i = 0; i < total; i++) {
    const t = i / SAMPLE_RATE;
    const env = Math.min(1, t / 0.02, (SECONDS - t) / 0.05); // short fades, no clicks
    const v = Math.sin(2 * Math.PI * 440 * t) * Math.sin(2 * Math.PI * 0.5 * t) * env;
    out[i] = Math.max(-32768, Math.min(32767, Math.round(v * 26000)));
  }
  return out;
}

// ---------- fixed predictors ----------
const FIXED = [
  (x, i) => x[i],                                   // order 0
  (x, i) => x[i] - x[i - 1],                         // order 1
  (x, i) => x[i] - 2 * x[i - 1] + x[i - 2],          // order 2
  (x, i) => x[i] - 3 * x[i - 1] + 3 * x[i - 2] - x[i - 3],
  (x, i) => x[i] - 4 * x[i - 1] + 6 * x[i - 2] - 4 * x[i - 3] + x[i - 4]
];
const fold = (r) => (r << 1) ^ (r >> 31); // zigzag -> unsigned

function bestRiceParam(folded) {
  let sum = 0;
  for (const v of folded) sum += v;
  const mean = sum / folded.length;
  return mean <= 0 ? 0 : Math.max(0, Math.min(14, Math.floor(Math.log2(mean))));
}
const riceCost = (folded, k) => {
  let bits = 0;
  for (const v of folded) bits += (v >>> k) + 1 + k;
  return bits;
};

/** Encode one subframe; returns bytes. Picks the cheapest FIXED order. */
function encodeSubframe(x) {
  const n = x.length;
  let best = null;
  for (let order = 0; order <= 4 && order < n; order++) {
    const res = [];
    for (let i = order; i < n; i++) res.push(FIXED[order](x, i));
    const folded = res.map(fold);
    const k = bestRiceParam(folded);
    const cost = riceCost(folded, k);
    if (!best || cost < best.cost) best = { order, folded, k, cost };
  }
  const { order, folded, k } = best;
  const w = new BitWriter();
  w.bits(0, 1);                   // padding bit
  w.bits(0b001000 | order, 6);    // subframe type: 001xxx = FIXED, order 0-4
  w.bits(0, 1);                   // wasted-bits flag = 0
  for (let i = 0; i < order; i++) w.bits(x[i] & 0xffff, BPS); // warm-up samples
  w.bits(0b00, 2);              // residual coding method 0: Rice, 4-bit partition order
  w.bits(0, 4);                 // partition order 0 (single partition)
  if (k >= 15) {
    // Escape: 5-bit raw sample size, then unencoded signed residuals.
    w.bits(15, 4);
    const maxBits = Math.max(...folded.map((v) => (v === 0 ? 1 : 32 - Math.clz32(v)) + 1));
    const size = Math.min(31, Math.max(1, maxBits));
    w.bits(size, 5);
    for (const v of folded) w.bits(v, size);
  } else {
    w.bits(k, 4);
    for (const v of folded) { w.unary(v >>> k); w.riceRemainder(v & ((1 << k) - 1), k); }
  }
  return w.bytes_out();
}

// ---------- frame ----------
function utf8FrameNumber(n) {
  if (n < 0x80) return [n];
  const out = [];
  for (let i = 0; i < 5; i++) {
    const b = (n >> (6 * i)) & 0x3f;
    const last = i === 4 || n < (1 << (6 * (i + 1)));
    out.unshift(last ? b : b | 0x80);
    if (last) break;
  }
  return out;
}

function encodeFrame(samples, frameNumber) {
  const bw = new BitWriter();
  bw.bits(0b11111111111110, 14); // sync
  bw.bits(0, 1);                  // reserved
  bw.bits(0, 1);                  // fixed-blocksize strategy
  bw.bits(0b0111, 4);             // block size: 16-bit (blocksize-1) follows header
  bw.bits(0b1001, 4);             // 44.1 kHz
  bw.bits(CHANNELS - 1, 4);       // independent channels
  bw.bits(0b100, 3);              // 16 bits per sample
  bw.bits(0, 1);                  // reserved
  for (const b of utf8FrameNumber(frameNumber)) bw.bits(b, 8);
  bw.bits(samples.length - 1, 16); // explicit block size - 1
  const header = bw.bytes_out();
  header.push(crc8(header));       // CRC-8 over everything so far

  const body = encodeSubframe(samples);
  const frame = [...header, ...body];
  // Frames are byte-aligned only (the subframe writer already zero-pads to a byte boundary).
  // There is no even-length requirement — adding one corrupts the stream.
  const crc = crc16(frame);
  frame.push((crc >> 8) & 0xff, crc & 0xff);
  return frame;
}

// ---------- metadata ----------
function streamInfo(minFrame, maxFrame, totalSamples) {
  const b = [];
  // BigInt throughout: the sample-rate/channels/bps/total-samples field is 64 bits wide, and
  // JavaScript bitwise operators are 32-bit, so `SAMPLE_RATE << 44` would silently wrap.
  const pushBE = (value, bytes) => {
    const v = BigInt(value);
    for (let i = bytes - 1; i >= 0; i--) b.push(Number((v >> BigInt(8 * i)) & 0xffn));
  };
  pushBE(BLOCK, 2);        // min block size
  pushBE(BLOCK, 2);        // max block size
  pushBE(minFrame, 3);     // min frame size in bytes
  pushBE(maxFrame, 3);     // max frame size in bytes
  // 20 bits sample rate | 3 bits (channels-1) | 5 bits (bps-1) | 36 bits total samples
  // = 64 bits = exactly 8 bytes. STREAMINFO must total 34 bytes (2+2+3+3+8+16).
  const packed =
    (BigInt(SAMPLE_RATE) << 44n) |
    (BigInt(CHANNELS - 1) << 41n) |
    (BigInt(BPS - 1) << 36n) |
    BigInt(totalSamples);
  for (let i = 7; i >= 0; i--) b.push(Number((packed >> BigInt(8 * i)) & 0xffn));
  for (let i = 0; i < 16; i++) b.push(0); // MD5 of unencoded audio: optional, all-zero is legal
  return b;
}

function vorbisComment(vendor, comment) {
  const payload = [];
  const le = (v, bytes) => { for (let i = 0; i < bytes; i++) payload.push((v / 2 ** (8 * i)) & 0xff); };
  le(vendor.length, 4);
  for (const ch of vendor) payload.push(ch.charCodeAt(0));
  le(1, 4); // one comment
  le(comment.length, 4);
  for (const ch of comment) payload.push(ch.charCodeAt(0));
  const out = [0x84]; // last-metadata-block = 1, type = 4 (VORBIS_COMMENT)
  out.push((payload.length >> 16) & 0xff, (payload.length >> 8) & 0xff, payload.length & 0xff);
  return out.concat(payload);
}

// ---------- assemble ----------
const total = SAMPLE_RATE * SECONDS;
const pcm = makeSamples(total);
const frames = [];
let frameCount = 0;
let minFrame = Infinity;
let maxFrame = 0;
for (let pos = 0, n = 0; pos < total; pos += BLOCK, n++) {
  const f = encodeFrame(pcm.subarray(pos, Math.min(pos + BLOCK, total)), n);
  frames.push(...f);
  frameCount++;
  minFrame = Math.min(minFrame, f.length);
  maxFrame = Math.max(maxFrame, f.length);
}

const info = streamInfo(minFrame, maxFrame, total);
const headerBlock = [0x00]; // not last, type 0 (STREAMINFO), length 34
headerBlock.push(0, 0, 34, ...info);

const file = Buffer.from([
  'fLaC'.split('').map((c) => c.charCodeAt(0)),
  headerBlock,
  vorbisComment('soundscape-test-fixture', 'Synthetic 440Hz decaying sine tone generated by tests/fixtures/make-flac-fixture.mjs. No copyrighted audio. 10s 44.1kHz 16-bit mono lossless FLAC.'),
  frames
].flat());

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, file);
console.log('FLAC fixture written:', OUT);
console.log('  bytes:', file.length, `(${(file.length / 1024).toFixed(1)} KB)`);
console.log(`  ${SECONDS}s ${SAMPLE_RATE}Hz ${BPS}-bit ${CHANNELS === 1 ? 'mono' : 'stereo'}, ${frameCount} frames, synthetic content`);
console.log('  magic:', file.subarray(0, 4).toString('ascii'));
