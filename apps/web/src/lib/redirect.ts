/**
 * Where to go after sign-in. Only same-site paths are allowed, so `?next=` can't send users
 * to another site (open redirect).
 */
export function safeNextPath(next: string | null | undefined, fallback = '/dashboard'): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) {
    return fallback;
  }
  try {
    const url = new URL(next, 'http://pypr.local');
    return url.origin === 'http://pypr.local'
      ? `${url.pathname}${url.search}${url.hash}`
      : fallback;
  } catch {
    return fallback;
  }
}
