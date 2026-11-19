// The person check on the engine's three doors that send mail: sign-up (register), password reset
// (request-password-reset) and resending the confirmation email (resend-verification). The engine
// checks the token this gets on the server; for a door it enforces, a request without a good token
// is refused (403) and no mail goes out.
//
// The site key is public and the engine hands it out (GET <engine>/v1/auth/person-check), so a
// product sets nothing at build time; with none set, no widget runs and no token is sent. The widget
// runs in Cloudflare's managed mode and is shown only when Cloudflare asks the person to do
// something; it renders into the visible [data-person-check] slot of the form being sent (AuthForm
// carries one), else into a box at the end of the page, so the form looks as it always has.
// A token is good for one request and only for the door it was made for (its action).
/* eslint-env browser */

const SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
const WAIT_MS = 60_000;

/** What a person reads when the check can't finish here (the engine's own words for its refusal). */
export const PERSON_CHECK_FAILED = "We couldn't confirm you're a person. Please try again.";

/** @type {Map<string, Promise<string>>} engine -> its site key; only an answer is kept */
const keys = new Map();
/** @type {Promise<any> | null} */
let script = null;

function siteKey(engine) {
  let p = keys.get(engine);
  if (!p) {
    p = fetch(`${engine}/v1/auth/person-check`, { cache: 'no-store' })
      .then(async (r) => {
        if (!r.ok) throw new Error('no answer');
        const b = await r.json();
        return typeof b?.site_key === 'string' ? b.site_key : '';
      })
      // a failed read is asked again next time, never remembered as "no key"
      .catch(() => { keys.delete(engine); return ''; });
    keys.set(engine, p);
  }
  return p;
}

function loadScript() {
  script ??= new Promise((resolve, reject) => {
    if (window.turnstile) { resolve(window.turnstile); return; }
    const s = document.createElement('script');
    s.src = SCRIPT; s.async = true; s.defer = true;
    s.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error(PERSON_CHECK_FAILED)));
    s.onerror = () => { script = null; s.remove(); reject(new Error(PERSON_CHECK_FAILED)); };
    document.head.appendChild(s);
  });
  return script;
}

function slot() {
  const shown = Array.from(document.querySelectorAll('[data-person-check]')).find((el) => el.offsetParent !== null);
  if (shown) return shown;
  let el = document.getElementById('person-check-fallback');
  if (!el) {
    el = document.createElement('div');
    el.id = 'person-check-fallback';
    el.className = 'person-check-fallback';
    document.body.appendChild(el);
  }
  return el;
}

/**
 * A fresh token for one door ('register' | 'reset' | 'resend'), or '' when the engine has no site key
 * set (nothing to check). Call it right before the request it goes with. Throws, with words for the
 * person, when the check can't finish.
 * @param {'register'|'reset'|'resend'} door
 * @param {string} engine the engine's base, as configureAuth was given it
 * @returns {Promise<string>}
 */
export async function personToken(door, engine) {
  const key = await siteKey(engine);
  if (!key) return '';
  const ts = await loadScript();
  const host = document.createElement('div');
  slot().appendChild(host);
  return new Promise((resolve, reject) => {
    let id = '';
    const done = (fn) => {
      clearTimeout(timer);
      try { if (id) ts.remove(id); } catch { /* already gone */ }
      host.remove();
      fn();
    };
    const fail = () => done(() => reject(new Error(PERSON_CHECK_FAILED)));
    const timer = setTimeout(fail, WAIT_MS);
    try {
      id = ts.render(host, {
        sitekey: key, action: door, appearance: 'interaction-only', theme: 'auto', 'refresh-expired': 'never',
        callback: (token) => done(() => resolve(token)),
        'error-callback': fail, 'expired-callback': fail, 'timeout-callback': fail,
      });
    } catch { fail(); }
  });
}
