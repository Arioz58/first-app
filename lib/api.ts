import { getAccessToken, getRefreshToken, saveTokens, clearTokens } from './storage';

const BASE_URL = 'http://192.168.1.181:3000';

type RequestOptions = {
  method?: string;
  body?: object;
  auth?: boolean;
};

export const apiRequest = async <T>(
  path: string,
  { method = 'GET', body, auth = true }: RequestOptions = {},
): Promise<T> => {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };

  if (auth) {
    const token = await getAccessToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401) {
    // Tenter un refresh
    const refreshToken = await getRefreshToken();
    if (refreshToken) {
      const refreshRes = await fetch(`${BASE_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      if (refreshRes.ok) {
        const data = await refreshRes.json();
        await saveTokens(data.accessToken, data.refreshToken);
        headers['Authorization'] = `Bearer ${data.accessToken}`;
        const retry = await fetch(`${BASE_URL}${path}`, {
          method,
          headers,
          body: body ? JSON.stringify(body) : undefined,
        });
        return retry.json();
      }
    }
    await clearTokens();
    throw new Error('SESSION_EXPIRED');
  }

  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Erreur serveur');
  return data;
};
