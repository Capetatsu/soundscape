const DEFAULT_REDIRECT_URI = 'http://127.0.0.1:3000/auth/callback';

export const getAllowedRedirectUris = (): string[] => {
  const uris = new Set<string>([
    'http://127.0.0.1:3000/auth/callback',
    'http://localhost:3000/auth/callback'
  ]);
  const appUrl = process.env.APP_URL;
  if (appUrl && appUrl.trim() && !appUrl.includes('MY_APP_URL')) {
    uris.add(`${appUrl.replace(/\/+$/, '')}/auth/callback`);
  }
  return Array.from(uris);
};

export const getAllowedRedirectUrisSet = (): Set<string> => {
  return new Set(getAllowedRedirectUris());
};

export const getRedirectUriForHost = (host: string, proto: string): string => {
  const candidate = `${proto}://${host}/auth/callback`;
  const allowed = getAllowedRedirectUrisSet();
  return allowed.has(candidate) ? candidate : getRedirectUri();
};

export const getRedirectUri = (): string => {
  const envRedirectUri = process.env.REDIRECT_URI;
  if (envRedirectUri && envRedirectUri.trim()) {
    return envRedirectUri.trim();
  }
  if (process.env.APP_URL && process.env.APP_URL.trim() && !process.env.APP_URL.includes('MY_APP_URL')) {
    return `${process.env.APP_URL.replace(/\/+$/, '')}/auth/callback`;
  }
  return 'http://127.0.0.1:3000/auth/callback';
};

export const REDIRECT_URI = getRedirectUri();