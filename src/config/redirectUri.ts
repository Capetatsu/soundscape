export const getRedirectUri = (): string => {
  const envRedirectUri = import.meta.env.VITE_REDIRECT_URI;
  if (envRedirectUri && envRedirectUri.trim()) {
    return envRedirectUri.trim();
  }
  // Default to 127.0.0.1 for development (Spotify requires exact match)
  return 'http://127.0.0.1:3000/auth/spotify/callback';
};

export const REDIRECT_URI = getRedirectUri();