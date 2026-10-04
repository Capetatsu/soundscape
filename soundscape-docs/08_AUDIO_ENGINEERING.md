# 08 Audio Engineering
## Scope split (critical)
| Feature | Spotify (SDK/Connect) | Local / own-server |
|---|---|---|
| Volume | YES (SDK setVolume) | YES |
| EQ, effects | NO | YES |
| Crossfade/gapless | NO (Soundscape can't) | YES (see below) |
| Loudness normalization | NO (Spotify's own setting only) | YES |
| Lossless/hi-res | NO claims; never | YES if source is lossless |
UI must show per-source feature flags; never label Spotify output "lossless" or "normalized by Soundscape".

## Web Audio graph (non-Spotify)
`MediaElementSource → GainNode(replayGain) → 10-band BiquadFilter chain → GainNode(preamp/volume) → DynamicsCompressor(optional limiter) → destination`.
## Normalization
Prefer ReplayGain/R128 tags (ID3 TXXX, Vorbis comments, MP4 atoms). Else analyze at import with EBU R128 (WASM ebur128) in a Worker; store `integrated_lufs`, `true_peak`. Target default −14 LUFS (configurable −23…−11); clamp gain so peak ≤ −1 dBTP.
## Crossfade
Two `<audio>` elements A/B with equal-power gain ramps over N s (0–12). Disabled for `repeat:one`, and when next item is Spotify.
## Gapless
Preload next into idle element; start at `ended−ε` using `AudioContext.currentTime` scheduling. Known limits: MP3 encoder padding needs LAME/iTunSMPB trim; document per-codec result in tests.
## Formats
Browser-decodable: MP3, AAC/M4A, FLAC (Chrome/Firefox/Safari current), WAV, OGG/Opus. Others (ALAC, DSD, WavPack) → "unsupported in web build".
## Buffering/network
Subsonic stream with `maxBitRate` adapt: Wi-Fi original, cellular ≤192 kbps (Network Information API where available, else user setting). Buffer target 30 s, rebuffer threshold 2 s.
## Not possible in browser (native-only, future)
USB DAC exclusive mode, bit-perfect output, sample-rate switching, Android Auto, audio-offload. Document in 25.
## Bluetooth/audio focus
OS owns codec negotiation. Web: pause on `mediaSession` interruptions/other-tab lock; resume-on-reconnect only if user setting on AND state was playing.
