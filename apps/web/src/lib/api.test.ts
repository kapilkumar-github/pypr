import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, apiRequest, fileNameFrom, refreshSession } from './api';

function respond(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), { status });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('apiRequest', () => {
  it('returns the JSON body and sends JSON', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(respond(200, { ok: true })));
    vi.stubGlobal('fetch', fetchMock);
    expect(await apiRequest('/api/x', { method: 'POST', body: { a: 1 } })).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/x',
      expect.objectContaining({
        method: 'POST',
        body: '{"a":1}',
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  });

  it('refreshes once on 401 and retries', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(respond(401))
      .mockResolvedValueOnce(respond(200, { user: 1 })) // refresh
      .mockResolvedValueOnce(respond(200, { retried: true }));
    vi.stubGlobal('fetch', fetchMock);
    expect(await apiRequest('/api/resumes')).toEqual({ retried: true });
    expect(fetchMock.mock.calls.map((call) => call[0] as string)).toEqual([
      '/api/resumes',
      '/api/auth/refresh',
      '/api/resumes',
    ]);
  });

  it('throws ApiError with the code when refresh fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(respond(401)).mockResolvedValueOnce(respond(401)),
    );
    await expect(apiRequest('/api/resumes')).rejects.toMatchObject({ status: 401 });
  });

  it('does not refresh for auth endpoints', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(respond(401, { message: 'Invalid email or password.' })),
    );
    vi.stubGlobal('fetch', fetchMock);
    await expect(apiRequest('/api/auth/login', { method: 'POST', body: {} })).rejects.toThrow(
      'Invalid email or password.',
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('exposes error codes', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(respond(409, { code: 'EMAIL_ALREADY_REGISTERED', message: 'Taken' })),
      ),
    );
    const error = await apiRequest('/api/auth/register', { method: 'POST', body: {} }).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 409,
      code: 'EMAIL_ALREADY_REGISTERED',
      message: 'Taken',
    });
  });

  it('maps network failures to ApiError status 0', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new TypeError('offline'))),
    );
    await expect(apiRequest('/api/x')).rejects.toMatchObject({ status: 0 });
  });
});

describe('refreshSession', () => {
  it('shares one request between concurrent callers', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(respond(200, {})));
    vi.stubGlobal('fetch', fetchMock);
    const results = await Promise.all([refreshSession(), refreshSession(), refreshSession()]);
    expect(results).toEqual([true, true, true]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('fileNameFrom', () => {
  it('prefers the UTF-8 name', () => {
    expect(
      fileNameFrom(
        `attachment; filename="Zoe - Resume.pdf"; filename*=UTF-8''Zo%C3%AB%20-%20Resume.pdf`,
      ),
    ).toBe('Zoë - Resume.pdf');
  });

  it('falls back to the plain name, then the default', () => {
    expect(fileNameFrom('attachment; filename="CV.pdf"')).toBe('CV.pdf');
    expect(fileNameFrom(null)).toBe('Resume.pdf');
  });
});
