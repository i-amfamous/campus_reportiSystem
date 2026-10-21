import { vi } from 'vitest';
test('api client attaches csrf header', async () => {
  document.cookie = 'campus_csrf=abc123';
  const fetchMock = vi
    .fn()
    .mockResolvedValue(
      new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }),
    );
  global.fetch = fetchMock as any;
  const { apiFetch } = await import('./api');
  await apiFetch('/x', { method: 'POST', body: '{}' });
  const headers = fetchMock.mock.calls[0][1].headers;
  expect(headers['X-CSRF-Token']).toBe('abc123');
});
