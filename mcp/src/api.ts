const API_BASE = process.env.FORMLY_API_URL ?? 'http://localhost:3001';

export async function api<T = unknown>(path: string, options: RequestInit = {}): Promise<T> {
  const isWrite = options.method === 'POST' || options.method === 'PUT';

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { ...(isWrite ? { 'Content-Type': 'application/json' } : {}), ...options.headers },
    body: isWrite && options.body === undefined ? '{}' : options.body,
  });

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    const message = (data as any)?.message ?? (data as any)?.error ?? `Request failed with status ${res.status}`;
    throw new Error(message);
  }

  return data as T;
}
