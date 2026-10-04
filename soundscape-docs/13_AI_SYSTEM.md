# 13 AI System
## Principle
The model suggests; the catalog decides. Nothing becomes playable unless resolved against a real provider.
## Pipeline
1. Client → `POST /api/ai/dj {prompt, mood?, context}`. Context sent only if user opted in: current track, ≤30 liked-song titles/artists (no IDs/emails).
2. Server → Gemini with JSON schema output `{intro, vibe, suggestions:[{title,artist,album?,reason}]}`; zod-validate; model id from `GEMINI_MODEL` env.
3. Client resolves each suggestion: `search("track:… artist:…")` on Spotify (limit 10) → score = 0.6·titleSim + 0.4·artistSim (normalized, Jaro-Winkler); accept ≥0.85; take best.
4. UI shows resolved tracks as playable; unresolved shown as "Couldn't find on Spotify" (not playable) or omitted. Never fabricate IDs/artwork.
5. Failure (no key, quota, timeout) → typed 503 → UI "AI unavailable". **No fallback demo tracks.**
## Features by phase
Natural-language search (parse → provider query), AI playlist generation (resolve → create via `POST /me/playlists` + `/items` with user confirmation), refinement ("more upbeat"), mood queue, listening-history Q&A (answers computed from local stats DB; LLM only phrases), conversational playback control (tool calls limited to PlayerController commands, each confirmed in UI log).
## Safety/privacy
Rate limit per session; prompt-injection hygiene (library text treated as data); user can delete AI history; review Spotify Developer Policy re: using Spotify data with AI (do not train; minimize).
