const DEFAULT_REDIRECT_URI = 'http://127.0.0.1:3000/auth/callback';

export const getRedirectUri = (): string => {
  const envRedirectUri = process.env.REDIRECT_URI;
  if (envRedirectUri && envRedirectUri.trim()) {
    return envRedirectUri.trim();
  }
  return DEFAULT_REDIRECT_URI;
};

export const REDIRECT_URI = getRedirectUri();