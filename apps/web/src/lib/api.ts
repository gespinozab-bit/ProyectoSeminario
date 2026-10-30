const API_URL = import.meta.env.VITE_API_URL ?? '';

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
  ) {
    super(message);
  }
}

async function execute(path: string, init?: RequestInit) {
  return fetch(`${API_URL}${path}`, {
    ...init,
    credentials: 'include',
    headers: { ...(init?.body ? { 'Content-Type': 'application/json' } : {}), ...init?.headers },
  });
}

export async function apiFetch<T>(path: string, init?: RequestInit, retry = true): Promise<T> {
  let response = await execute(path, init);
  if (response.status === 401 && retry && !path.startsWith('/api/auth/')) {
    const refresh = await execute('/api/auth/refresh', { method: 'POST' });
    if (refresh.ok) response = await execute(path, init);
    else window.dispatchEvent(new Event('lensegua:session-expired'));
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: string;
      code?: string;
    } | null;
    throw new ApiError(
      body?.error ?? 'No fue posible completar la solicitud.',
      response.status,
      body?.code,
    );
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}
