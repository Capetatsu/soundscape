export const getRedirectUri = (): string => {
  const envRedirectUri = import.meta.env.VITE_REDIRECT_URI;
  if (envRedirectUri && envRedirectUri.trim()) {
    return envRedirectUri.trim();
  }
  return 'http://127.0.0.1:3000/auth/callback';
};

export const REDIRECT_URI = getRedirectUri();