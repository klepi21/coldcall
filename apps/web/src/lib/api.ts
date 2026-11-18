export class ApiError extends Error {
  constructor(message: string, public code: string, public status: number) {
    super(message);
  }
}

export async function api<T = any>(path: string, body?: unknown, method?: string): Promise<T> {
  const r = await fetch(path, {
    method: method ?? (body === undefined ? 'GET' : 'POST'),
    credentials: 'include',
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let j: any = null;
  try {
    j = await r.json();
  } catch {
    /* empty */
  }
  if (!r.ok) throw new ApiError(j?.message ?? 'Something went wrong. Please try again.', j?.error ?? 'unknown', r.status);
  return j as T;
}

export const wsUrl = () => {
  if (typeof window === 'undefined') return '';
  const env = process.env.NEXT_PUBLIC_WS_URL;
  if (env) return env;
  // Same host, API port. Cookies are per host, so the session cookie set via the /api proxy is sent here too.
  return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.hostname}:4000/ws`;
};

export function randomClientSeed() {
  const a = new Uint8Array(8);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');
}
