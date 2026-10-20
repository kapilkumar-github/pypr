'use client';

import { authResponseSchema, type AuthUser } from '@pypr/validation';
import { usePathname, useRouter } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { ApiError, apiGet, apiRequest } from './api';

interface Session {
  user: AuthUser;
  signOut: () => Promise<void>;
}

const SessionContext = createContext<Session | null>(null);

/**
 * Loads the signed-in user for the app area; sends signed-out visitors to /login and back
 * here afterwards. The API stays the real gatekeeper; this only decides what to render.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiGet('/api/auth/me', authResponseSchema)
      .then(({ user: me }) => {
        if (!cancelled) setUser(me);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        if (error instanceof ApiError && error.status === 401) {
          router.replace(`/login?next=${encodeURIComponent(pathname)}`);
        } else {
          setFailed(error instanceof Error ? error.message : 'Something went wrong.');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [router, pathname]);

  const signOut = useCallback(async () => {
    await apiRequest('/api/auth/logout', { method: 'POST' }).catch(() => undefined);
    router.replace('/login');
  }, [router]);

  if (failed) {
    return (
      <p role="alert" className="p-8 text-center text-sm text-ink-muted">
        {failed}
      </p>
    );
  }
  if (!user) {
    return (
      <p className="p-8 text-center text-sm text-ink-subtle" aria-live="polite">
        Loading…
      </p>
    );
  }
  return <SessionContext.Provider value={{ user, signOut }}>{children}</SessionContext.Provider>;
}

export function useSession(): Session {
  const session = useContext(SessionContext);
  if (!session) throw new Error('useSession must be used inside SessionProvider');
  return session;
}

/** On /login and /register: skip the form when already signed in. */
export function useRedirectIfSignedIn(next: string): void {
  const router = useRouter();
  useEffect(() => {
    let cancelled = false;
    apiRequest('/api/auth/me')
      .then(() => {
        if (!cancelled) router.replace(next);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [router, next]);
}
