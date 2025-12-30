/**
 * Shared fetch wrapper that includes credentials.
 * This is required for Cloudflare Access authentication - the CF_Authorization
 * cookie must be sent with all API requests.
 */
export function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return fetch(input, {
    ...init,
    credentials: 'include'
  });
}
