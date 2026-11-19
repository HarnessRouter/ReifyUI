// The engine's mail doors (reset, resend, register) carry a person-check token, and a refusal is said, never
// shown as "check your email" with no mail coming (CAT 11-19: the engine now enforces reset and resend).
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { configureAuth, requestPasswordReset, resendVerification, register } from '../src/auth/client.js';

let calls = [];
let answers = {};
let rendered = [];

function setup({ siteKey = 'site-key-1', personCheckOk = true } = {}) {
  calls = []; rendered = [];
  answers = {};
  globalThis.window = globalThis;
  globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
  globalThis.CustomEvent = class { constructor(t) { this.type = t; } };
  globalThis.dispatchEvent = () => true;
  const el = () => ({ offsetParent: {}, appendChild() {}, remove() {}, setAttribute() {} });
  globalThis.document = {
    querySelectorAll: () => [el()],
    getElementById: () => null,
    createElement: () => el(),
    head: { appendChild() {} },
    body: { appendChild() {} },
  };
  globalThis.turnstile = {
    render: (_host, opts) => { rendered.push(opts); setTimeout(() => opts.callback(`tok-${opts.action}`), 0); return `w${rendered.length}`; },
    remove: () => {},
  };
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url, body: init.body ? JSON.parse(init.body) : null });
    if (url.endsWith('/v1/auth/person-check')) {
      return personCheckOk
        ? new Response(JSON.stringify({ site_key: siteKey, doors: ['register', 'reset', 'resend'] }), { status: 200 })
        : new Response('no', { status: 502 });
    }
    const a = answers[url] || { status: 200, body: { ok: true } };
    return new Response(JSON.stringify(a.body), { status: a.status, headers: { 'content-type': 'application/json' } });
  };
}

// each test gets its own engine base, so the site key the client keeps per engine starts fresh
let n = 0;
beforeEach(() => { n += 1; });
const engine = () => `/engine${n}`;

test('reset sends a token made for the reset door', async () => {
  setup(); configureAuth({ product: 'flowness', engine: engine() });
  await requestPasswordReset('a@b.co');
  const post = calls.find((c) => c.url.endsWith('/request-password-reset'));
  assert.deepEqual(post.body, { email: 'a@b.co', product: 'flowness', turnstile_token: 'tok-reset' });
  assert.equal(rendered[0].action, 'reset');
  assert.equal(rendered[0].sitekey, 'site-key-1');
});

test('a refused reset throws the engine\'s own sentence, not a silent success', async () => {
  setup(); configureAuth({ product: 'flowness', engine: engine() });
  answers[`${engine()}/v1/auth/request-password-reset`] = { status: 403, body: { detail: "We couldn't confirm you're a person. Please try again." } };
  await assert.rejects(requestPasswordReset('a@b.co'), /couldn't confirm you're a person/);
});

test('a server error on reset throws the general words', async () => {
  setup(); configureAuth({ product: 'flowness', engine: engine() });
  answers[`${engine()}/v1/auth/request-password-reset`] = { status: 502, body: { detail: 'upstream 502 from mailer' } };
  await assert.rejects(requestPasswordReset('a@b.co'), /could not send the request/);
});

test('resend sends a token made for the resend door', async () => {
  setup(); configureAuth({ product: 'contextualgraph', engine: engine() });
  await resendVerification('a@b.co');
  const post = calls.find((c) => c.url.endsWith('/resend-verification'));
  assert.deepEqual(post.body, { email: 'a@b.co', product: 'contextualgraph', turnstile_token: 'tok-resend' });
});

test('register sends a token made for the register door', async () => {
  setup(); configureAuth({ product: 'sheets', engine: engine() });
  answers[`${engine()}/v1/auth/register`] = { status: 200, body: { token: 't', member: 'm', orgs: [], org_id: null } };
  await register('a@b.co', 'a-long-password', 'A');
  const post = calls.find((c) => c.url.endsWith('/v1/auth/register'));
  assert.equal(post.body.turnstile_token, 'tok-register');
});

test('no site key set: no widget, an empty token, and the request still goes', async () => {
  setup({ siteKey: '' }); configureAuth({ product: 'flowness', engine: engine() });
  await requestPasswordReset('a@b.co');
  assert.equal(rendered.length, 0);
  assert.equal(calls.find((c) => c.url.endsWith('/request-password-reset')).body.turnstile_token, '');
});

test('person-check unreadable: asked again next time, never remembered as no key', async () => {
  setup({ personCheckOk: false }); configureAuth({ product: 'flowness', engine: engine() });
  await requestPasswordReset('a@b.co');
  setup(); // same engine base, now answering
  await requestPasswordReset('a@b.co');
  assert.equal(calls.filter((c) => c.url.endsWith('/person-check')).length, 1);
  assert.equal(calls.find((c) => c.url.endsWith('/request-password-reset')).body.turnstile_token, 'tok-reset');
});
