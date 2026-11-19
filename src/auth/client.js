// Shared product auth client — a thin client over the AgentStudio engine's
// /v1/auth endpoints, extracted from ContextualGraph. Product apps configure
// it ONCE at boot:
//
//   configureAuth({ product: 'flowness', engine: ENGINE_URL, loginHash: '#/login' })
//
// The JWT is the source of truth; the decoded principal (member / orgs /
// active org) is stored alongside it in localStorage under
// `<product>.session`. Stateless on the server side: every request just
// carries the Bearer token. All functions below read the live config, so
// call order (configure first) is the only contract.
/* eslint-env browser */

import { personToken } from './personCheck.js';

const _cfg = {
  // Same-origin. A product that forgets to configure gets the working default rather than the
  // engine's Azure FQDN, which no browser may call — its ingress admits only the VM that fronts
  // these apps, so a direct call 403s and reads as "Failed to fetch".
  engine: '/engine',
  product: '',
  loginHash: '#/login',
};

export function configureAuth(cfg) {
  Object.assign(_cfg, cfg);
  if (!_cfg.product) throw new Error('configureAuth: product is required');
}

export function authConfig() { return { ..._cfg }; }

function sessionKey() { return `${_cfg.product}.session`; }

/** Fired on every session write so chrome holding a snapshot can re-read. */
export const SESSION_EVENT = 'ui-core:session';

export function getSession() {
  try {
    const raw = window.localStorage.getItem(sessionKey());
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function setSession(s) {
  window.localStorage.setItem(sessionKey(), JSON.stringify(s));
  window.dispatchEvent(new CustomEvent(SESSION_EVENT));
}

export function clearSession() {
  window.localStorage.removeItem(sessionKey());
  window.dispatchEvent(new CustomEvent(SESSION_EVENT));
}

export function getToken() {
  return getSession()?.token ?? null;
}

export function isAuthed() {
  const s = getSession();
  return !!(s?.token && s?.orgId);
}

async function readError(res) {
  try {
    const body = await res.json();
    return typeof body?.detail === 'string' ? body.detail : `request failed (${res.status})`;
  } catch {
    return `request failed (${res.status})`;
  }
}

function toSession(body) {
  return {
    token: body.token,
    member: body.member,
    orgs: body.orgs ?? [],
    orgId: body.org_id ?? null,
  };
}

async function authPost(path, body, token = null) {
  const headers = { 'content-type': 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(`${_cfg.engine}${path}`, {
    method: 'POST',
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(await readError(res));
  return res.json();
}

export async function login(email, password) {
  const s = toSession(await authPost('/v1/auth/login', { email, password, product: _cfg.product }));
  setSession(s);
  return s;
}

export async function register(email, password, name = '') {
  const turnstile_token = await personToken('register', _cfg.engine);
  const s = toSession(await authPost('/v1/auth/register', { email, password, name, product: _cfg.product, turnstile_token }));
  setSession(s);
  return s;
}

export async function googleSignIn(credential) {
  const s = toSession(await authPost('/v1/auth/google', { credential, product: _cfg.product }));
  setSession(s);
  return s;
}

// Exchange a Microsoft (Entra) id token for a session, as googleSignIn does
// with Google's. The engine answers a refusal with a sentence to show as is:
// a personal account, a disabled member, or sign-in not configured.
export async function microsoftSignIn(credential) {
  const s = toSession(await authPost('/v1/auth/microsoft', { credential, product: _cfg.product }));
  setSession(s);
  return s;
}

// A reset or resend refusal in the person's words: the engine's own sentence for a check it refused
// (the person check, an address whose domain takes no mail), else the general one. Neither says
// whether the address has an account: the engine answers 200 for one it doesn't know.
async function readMailDoorError(res) {
  if (res.status === 400 || res.status === 403 || res.status === 503) {
    try {
      const d = (await res.json())?.detail;
      if (typeof d === 'string' && d.length > 0 && d.length < 200) return d;
    } catch { /* not JSON */ }
  }
  return 'We could not send the request. Please try again later.';
}

async function mailDoor(path, door, email) {
  const turnstile_token = await personToken(door, _cfg.engine);
  const res = await fetch(`${_cfg.engine}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, product: _cfg.product, turnstile_token }),
  });
  // a refusal is said, never shown as "check your email" with no mail coming
  if (!res.ok) throw new Error(await readMailDoorError(res));
}

/** Ask for a password reset link. Resolves when the engine took the request (it answers the same
 *  whether or not the address has an account); throws with words for the person when it refused. */
export async function requestPasswordReset(email) {
  await mailDoor('/v1/auth/request-password-reset', 'reset', email);
}

/** Send the confirmation email again, as requestPasswordReset does. */
export async function resendVerification(email) {
  await mailDoor('/v1/auth/resend-verification', 'resend', email);
}

/** Re-mint an org-scoped token for the chosen org. */
export async function switchOrg(orgId) {
  const current = getSession();
  if (!current) throw new Error('not authenticated');
  const body = await authPost('/v1/auth/switch-org', { org_id: orgId }, current.token);
  const next = { ...current, token: body.token, orgId: body.org_id };
  setSession(next);
  return next;
}

/** Slide the session: swap the still valid token for a fresh full TTL one. */
export async function refreshToken() {
  const cur = getSession();
  if (!cur?.token) return false;
  try {
    const res = await fetch(`${_cfg.engine}/v1/auth/refresh`, {
      method: 'POST',
      headers: { authorization: `Bearer ${cur.token}` },
    });
    if (res.status === 401) { handleAuthExpired(); return false; }
    if (!res.ok) return false;
    const body = await res.json();
    const now = getSession();
    if (body?.token && now) setSession({ ...now, token: body.token });
    return true;
  } catch {
    return false; // offline, keep the session and retry later
  }
}

let redirecting = false;
/** The token is dead: clear the session and land on the login route. */
export function handleAuthExpired() {
  if (redirecting) return;
  redirecting = true;
  clearSession();
  window.location.hash = _cfg.loginHash;
  setTimeout(() => { redirecting = false; }, 500);
}

export function logout() {
  clearSession();
  window.location.hash = _cfg.loginHash;
}

/** fetch() with the Bearer token; a 401 fails closed into the login route. */
export async function authFetch(url, init = {}) {
  const headers = new Headers(init.headers);
  const token = getToken();
  if (token) headers.set('authorization', `Bearer ${token}`);
  const res = await fetch(url, { ...init, headers });
  if (res.status === 401) handleAuthExpired();
  return res;
}

/** GET the org's credit balance from the engine billing plane. */
export async function fetchBalance() {
  const res = await authFetch(`${_cfg.engine}/v1/billing/balance`);
  if (!res.ok) throw new Error(await readError(res));
  return res.json();
}
