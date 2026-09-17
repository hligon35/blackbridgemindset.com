import { sendEmail } from '../../email';
import { recordActivity } from '../../shared/submissions';
import { wrapBbmEmailHtml, renderBbmCodeBoxHtml } from '../../emailTheme';
import { jsonResponse } from '../../shared/http';
import { escapeHtml, normalizeEmail } from '../../shared/sanitize';

function isDevMode(env) {
  return String(env.SCHEDULE_DEV_MODE || '').toLowerCase() === 'true';
}

function getRequestHost(request) {
  return new URL(request.url).host;
}

function parseAllowedHosts(env) {
  const raw = String(env.SCHEDULE_ADMIN_ALLOWED_HOSTS || '').trim();
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function enforceAdminHost(request, env, corsHeaders) {
  const host = getRequestHost(request).toLowerCase();

  if (isDevMode(env)) return null;

  if (host.endsWith('.workers.dev')) {
    return jsonResponse({ ok: false, error: 'Forbidden' }, { status: 403, headers: corsHeaders });
  }

  const allowedHosts = parseAllowedHosts(env);
  if (allowedHosts.length > 0 && !allowedHosts.includes(host)) {
    return jsonResponse({ ok: false, error: 'Forbidden' }, { status: 403, headers: corsHeaders });
  }

  return null;
}

function timingSafeEqual(a, b) {
  const aa = String(a);
  const bb = String(b);
  if (aa.length !== bb.length) return false;
  let out = 0;
  for (let i = 0; i < aa.length; i += 1) out |= aa.charCodeAt(i) ^ bb.charCodeAt(i);
  return out === 0;
}

function parseAllowedEmails(env) {
  const raw = String(env.ADMIN_ALLOWED_EMAILS || '').trim();
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function isAllowedEmail(env, email) {
  const list = parseAllowedEmails(env);
  if (list.length === 0) return false;
  return list.includes(email);
}

function randomOtpCode() {
  const max = 1000000;
  const limit = Math.floor(0x100000000 / max) * max;
  const bytes = new Uint8Array(4);
  while (true) {
    crypto.getRandomValues(bytes);
    const num =
      bytes[0] * 0x1000000 +
      bytes[1] * 0x10000 +
      bytes[2] * 0x100 +
      bytes[3];
    if (num >= limit) continue;
    return String(num % max).padStart(6, '0');
  }
}

function base64UrlEncode(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlDecodeToString(input) {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(input.length / 4) * 4, '=');
  return atob(padded);
}

async function sha256Base64Url(input) {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return base64UrlEncode(new Uint8Array(hash));
}

function getCookie(request, name) {
  const header = request.headers.get('Cookie') || '';
  const parts = header.split(';').map((p) => p.trim());
  for (const p of parts) {
    const idx = p.indexOf('=');
    if (idx === -1) continue;
    const k = p.slice(0, idx);
    const v = p.slice(idx + 1);
    if (k === name) return decodeURIComponent(v);
  }
  return '';
}

async function hmacSha256Base64Url(secret, message) {
  const keyData = new TextEncoder().encode(secret);
  const key = await crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return base64UrlEncode(new Uint8Array(sig));
}

function makeSessionCookie(value, { maxAgeSeconds, secure }) {
  const parts = [`bbm_admin=${encodeURIComponent(value)}`, 'Path=/', 'HttpOnly', 'SameSite=Strict'];

  if (secure) {
    parts.push('Secure');
  }

  if (typeof maxAgeSeconds === 'number') {
    parts.push(`Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}`);
  }
  return parts.join('; ');
}

function base64UrlToUint8Array(input) {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(input.length / 4) * 4, '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

let accessJwksCache = null; // { teamDomain, keys, fetchedAtMs }
const ACCESS_JWKS_TTL_MS = 60 * 60 * 1000;

async function getAccessJwks(teamDomain) {
  if (accessJwksCache && accessJwksCache.teamDomain === teamDomain && Date.now() - accessJwksCache.fetchedAtMs < ACCESS_JWKS_TTL_MS) {
    return accessJwksCache.keys;
  }

  const res = await fetch(`https://${teamDomain}/cdn-cgi/access/certs`);
  if (!res.ok) throw new Error('Failed to fetch Access certs');
  const data = await res.json();
  const keys = Array.isArray(data?.keys) ? data.keys : [];
  accessJwksCache = { teamDomain, keys, fetchedAtMs: Date.now() };
  return keys;
}

// Verifies a Cloudflare Access JWT (Cf-Access-Jwt-Assertion) and returns the
// authenticated email, so a successful Access login (e.g. Google SSO) can be
// trusted directly without a separate OTP step.
async function verifyAccessJwt(request, env) {
  const teamDomain = String(env.CF_ACCESS_TEAM_DOMAIN || '').trim();
  const aud = String(env.CF_ACCESS_AUD || '').trim();
  if (!teamDomain || !aud) return null;

  const token = request.headers.get('Cf-Access-Jwt-Assertion') || getCookie(request, 'CF_Authorization');
  if (!token) return null;

  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [headerB64, payloadB64, sigB64] = parts;

  let header;
  let payload;
  try {
    header = JSON.parse(new TextDecoder().decode(base64UrlToUint8Array(headerB64)));
    payload = JSON.parse(new TextDecoder().decode(base64UrlToUint8Array(payloadB64)));
  } catch {
    return null;
  }

  if (header.alg !== 'RS256' || !header.kid) return null;

  const audClaim = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!audClaim.includes(aud)) return null;

  const exp = Number(payload.exp);
  if (!Number.isFinite(exp) || Date.now() >= exp * 1000) return null;

  if (payload.iss && !String(payload.iss).includes(teamDomain)) return null;

  let keys;
  try {
    keys = await getAccessJwks(teamDomain);
  } catch {
    return null;
  }

  const jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) return null;

  let cryptoKey;
  try {
    cryptoKey = await crypto.subtle.importKey(
      'jwk',
      jwk,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify']
    );
  } catch {
    return null;
  }

  const signedData = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  const signature = base64UrlToUint8Array(sigB64);

  const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', cryptoKey, signature, signedData);
  if (!valid) return null;

  const email = normalizeEmail(payload.email);
  if (!email) return null;

  return email;
}

export async function verifyAdminSession(request, env) {
  const accessEmail = await verifyAccessJwt(request, env);
  if (accessEmail && isAllowedEmail(env, accessEmail)) {
    return { ok: true, status: 200, email: accessEmail };
  }

  const secret = String(env.ADMIN_SESSION_SECRET || '').trim();
  if (!secret) return { ok: false, status: 501, error: 'Session secret not configured' };

  const value = getCookie(request, 'bbm_admin');
  if (!value) return { ok: false, status: 401, error: 'Unauthorized' };

  const idx = value.lastIndexOf('.');
  if (idx === -1) return { ok: false, status: 401, error: 'Unauthorized' };

  const payload = value.slice(0, idx);
  const sig = value.slice(idx + 1);

  const expected = await hmacSha256Base64Url(secret, payload);
  if (!timingSafeEqual(sig, expected)) return { ok: false, status: 401, error: 'Unauthorized' };

  let decoded;
  try {
    decoded = JSON.parse(base64UrlDecodeToString(payload));
  } catch {
    return { ok: false, status: 401, error: 'Unauthorized' };
  }

  const email = normalizeEmail(decoded?.email);
  const exp = Number(decoded?.exp);
  if (!email || !Number.isFinite(exp) || Date.now() > exp) {
    return { ok: false, status: 401, error: 'Unauthorized' };
  }

  if (!isAllowedEmail(env, email)) {
    return { ok: false, status: 401, error: 'Unauthorized' };
  }

  return { ok: true, status: 200, email };
}

async function sendOtpEmail(env, { toEmail, code }) {
  const subject = 'Your Black Bridge Mindset admin login code';
  const text = `Hi,\n\nHere is your Black Bridge Mindset admin login code:\n\n${code}\n\nThis code expires in 10 minutes. If you didn’t request this code, you can ignore this email.\n\n— Mike`;

  const html = wrapBbmEmailHtml({
    title: 'Admin login code',
    preheader: 'Your admin login code is inside',
    contentHtml: `
      <p style="margin:0 0 12px 0;">Hi,</p>
      <p style="margin:0 0 12px 0;">Here is your Black Bridge Mindset admin login code:</p>
      <div style="margin:0 0 12px 0;">${renderBbmCodeBoxHtml(escapeHtml(code))}</div>
      <p style="margin:0 0 12px 0; color:#bdbdbd;">This code expires in 10 minutes. If you didn’t request this code, you can ignore this email.</p>
      <p style="margin:0;">— Mike</p>
    `,
  });

  await sendEmail(env, {
    to: toEmail,
    fromEmail: env.EMAIL_FROM,
    fromName: env.FROM_NAME || 'Black Bridge Mindset',
    subject,
    text,
    html,
  });
}

async function rateLimit(env, { key, limit, windowSeconds }) {
  if (!env.SCHEDULE_CONFIG) return { ok: true };

  const k = `admin:rl:${key}`;
  const current = Number(await env.SCHEDULE_CONFIG.get(k));
  const next = Number.isFinite(current) ? current + 1 : 1;
  if (next > limit) return { ok: false };

  await env.SCHEDULE_CONFIG.put(k, String(next), { expirationTtl: windowSeconds });
  return { ok: true };
}

export async function handleAdminAuth(request, env, corsHeaders) {
  const hostError = enforceAdminHost(request, env, corsHeaders);
  if (hostError) return hostError;

  const url = new URL(request.url);

  if (url.pathname === '/api/schedule/admin/auth/session') {
    const session = await verifyAdminSession(request, env);
    if (!session.ok) {
      return jsonResponse({ ok: false, error: session.error }, { status: session.status, headers: corsHeaders });
    }

    return jsonResponse({ ok: true, email: session.email }, { status: 200, headers: corsHeaders });
  }

  if (url.pathname === '/api/schedule/admin/auth/logout') {
    const session = await verifyAdminSession(request, env);
    if (session.ok) {
      await recordActivity(env, {
        action: 'admin.logout',
        entityType: 'admin',
        actorEmail: session.email,
      });
    }

    return jsonResponse(
      { ok: true },
      {
        status: 200,
        headers: {
          ...corsHeaders,
          'Set-Cookie': makeSessionCookie('', { maxAgeSeconds: 0, secure: !isDevMode(env) }),
        },
      }
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ ok: false, error: 'Invalid JSON' }, { status: 400, headers: corsHeaders });
  }

  if (url.pathname === '/api/schedule/admin/auth/start') {
    const email = normalizeEmail(body?.email);
    if (!email || !email.includes('@')) {
      return jsonResponse({ ok: false, error: 'Invalid email' }, { status: 400, headers: corsHeaders });
    }

    if (!isAllowedEmail(env, email)) {
      return jsonResponse({ ok: false, error: 'Access denied' }, { status: 403, headers: corsHeaders });
    }

    const ip = request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || 'unknown';

    const rl1 = await rateLimit(env, { key: `ip:${ip}`, limit: 10, windowSeconds: 600 });
    const rl2 = await rateLimit(env, { key: `email:${email}`, limit: 5, windowSeconds: 600 });
    if (!rl1.ok || !rl2.ok) {
      return jsonResponse({ ok: false, error: 'Too many attempts' }, { status: 429, headers: corsHeaders });
    }

    if (!env.SCHEDULE_CONFIG) {
      return jsonResponse({ ok: false, error: 'OTP storage not configured' }, { status: 501, headers: corsHeaders });
    }

    const otpSecret = String(env.ADMIN_OTP_SECRET || '').trim();
    if (!otpSecret) {
      return jsonResponse({ ok: false, error: 'OTP secret not configured' }, { status: 501, headers: corsHeaders });
    }

    const code = randomOtpCode();
    const hash = await sha256Base64Url(`${otpSecret}:${email}:${code}`);

    await env.SCHEDULE_CONFIG.put(`admin:otp:${email}`, hash, { expirationTtl: 600 });
    await env.SCHEDULE_CONFIG.put(`admin:otp_attempts:${email}`, '0', { expirationTtl: 600 });

    if (isDevMode(env)) {
      return jsonResponse({ ok: true, devCode: code }, { status: 200, headers: corsHeaders });
    }

    try {
      await sendOtpEmail(env, { toEmail: email, code });
    } catch (e) {
      return jsonResponse(
        { ok: false, error: e instanceof Error ? e.message : 'Failed to send code' },
        { status: 502, headers: corsHeaders }
      );
    }

    return jsonResponse({ ok: true }, { status: 200, headers: corsHeaders });
  }

  if (url.pathname === '/api/schedule/admin/auth/verify') {
    const email = normalizeEmail(body?.email);
    const code = String(body?.code || '').trim();

    if (!email || !code) {
      return jsonResponse({ ok: false, error: 'Missing fields' }, { status: 400, headers: corsHeaders });
    }

    if (!isAllowedEmail(env, email)) {
      return jsonResponse({ ok: false, error: 'Access denied' }, { status: 403, headers: corsHeaders });
    }

    if (!env.SCHEDULE_CONFIG) {
      return jsonResponse({ ok: false, error: 'OTP storage not configured' }, { status: 501, headers: corsHeaders });
    }

    const attemptsKey = `admin:otp_attempts:${email}`;
    const attempts = Number(await env.SCHEDULE_CONFIG.get(attemptsKey));
    if (Number.isFinite(attempts) && attempts >= 5) {
      return jsonResponse({ ok: false, error: 'Too many attempts' }, { status: 429, headers: corsHeaders });
    }

    const otpSecret = String(env.ADMIN_OTP_SECRET || '').trim();
    if (!otpSecret) {
      return jsonResponse({ ok: false, error: 'OTP secret not configured' }, { status: 501, headers: corsHeaders });
    }

    const expectedHash = await env.SCHEDULE_CONFIG.get(`admin:otp:${email}`);
    const gotHash = await sha256Base64Url(`${otpSecret}:${email}:${code}`);

    if (!expectedHash || expectedHash !== gotHash) {
      const next = Number.isFinite(attempts) ? attempts + 1 : 1;
      await env.SCHEDULE_CONFIG.put(attemptsKey, String(next), { expirationTtl: 600 });
      return jsonResponse({ ok: false, error: 'Invalid code' }, { status: 401, headers: corsHeaders });
    }

    await env.SCHEDULE_CONFIG.delete(`admin:otp:${email}`);
    await env.SCHEDULE_CONFIG.delete(attemptsKey);

    const sessionSecret = String(env.ADMIN_SESSION_SECRET || '').trim();
    if (!sessionSecret) {
      return jsonResponse({ ok: false, error: 'Session secret not configured' }, { status: 501, headers: corsHeaders });
    }

    const sessionExpMs = Date.now() + 12 * 60 * 60 * 1000;
    const payloadObj = { email, exp: sessionExpMs };
    const payloadJson = JSON.stringify(payloadObj);
    const payloadB64 = base64UrlEncode(new TextEncoder().encode(payloadJson));
    const sig = await hmacSha256Base64Url(sessionSecret, payloadB64);
    const token = `${payloadB64}.${sig}`;

    await recordActivity(env, {
      action: 'admin.login',
      entityType: 'admin',
      actorEmail: email,
    });

    return jsonResponse(
      { ok: true },
      {
        status: 200,
        headers: {
          ...corsHeaders,
          'Set-Cookie': makeSessionCookie(token, { maxAgeSeconds: 12 * 60 * 60, secure: !isDevMode(env) }),
        },
      }
    );
  }

  return jsonResponse({ ok: false, error: 'Not found' }, { status: 404, headers: corsHeaders });
}
