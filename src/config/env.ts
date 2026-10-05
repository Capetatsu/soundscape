/**
 * Build-time env reader.
 *
 * IMPORTANT — why this file looks the way it does:
 * Vite replaces `import.meta.env.SOME_KEY` with a string literal **only** when it sees a
 * direct member expression. Reading it through an alias, e.g.
 *
 *     const meta = import.meta as unknown as { env?: Record<string, string | undefined> };
 *     const key = meta.env?.SOME_KEY;          // <-- BROKEN
 *
 * compiles to a *runtime* `import.meta.env?.SOME_KEY`. In an ES-module build `import.meta.env`
 * does not exist, so that is always `undefined` and the value is silently lost — the provider
 * just reports itself unconfigured and quietly never queries its API.
 *
 * The `try/catch` below keeps the read safe when this module is loaded outside Vite
 * (plain `node`/`tsx`, e.g. server-side tooling), where `import.meta.env` is undefined.
 */
export function readEnvKey(key: 'VITE_JAMENDO_CLIENT_ID'): string | null {
  try {
    // Direct member expression — required for Vite's define-time substitution.
    const raw = key === 'VITE_JAMENDO_CLIENT_ID' ? import.meta.env.VITE_JAMENDO_CLIENT_ID : undefined;
    const trimmed = typeof raw === 'string' ? raw.trim() : '';
    return trimmed || null;
  } catch {
    return null;
  }
}