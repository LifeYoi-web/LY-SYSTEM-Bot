export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, { credentials: 'include', ...init });
  if (res.status === 401) throw new Error('unauthorized');
  if (!res.ok) {
    const err = new Error(`request failed: ${res.status}`);
    (err as any).status = res.status;
    throw err;
  }
  return res.json() as Promise<T>;
}

function jsonInit(method: string, body?: unknown): RequestInit {
  return {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  };
}

export const apiPost = <T>(path: string, body?: unknown): Promise<T> => api<T>(path, jsonInit('POST', body));
export const apiPut = <T>(path: string, body?: unknown): Promise<T> => api<T>(path, jsonInit('PUT', body));
export const apiDelete = <T>(path: string): Promise<T> => api<T>(path, { method: 'DELETE' });
