import { verifyAdminSession } from './auth';
import { sendEmail } from '../../email';
import { wrapBbmEmailHtml, bbmLinkStyle, renderBbmButtonHtml } from '../../emailTheme';
import { listActivity, listSubmissions, updateSubmissionStatus } from './inbox';
import { recordActivity } from '../../shared/submissions';
import { buildNewsletterEmail, deleteNewsletterCampaign, listNewsletterCampaigns, saveNewsletterCampaign } from './newsletterCampaigns';

function jsonResponse(body, { status = 200, headers = {} } = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...headers,
    },
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function unauthorized(corsHeaders) {
  return jsonResponse({ ok: false, error: 'Unauthorized' }, { status: 401, headers: corsHeaders });
}

function isDevMode(env) {
  return String(env.SCHEDULE_DEV_MODE || '').toLowerCase() === 'true';
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function dedupeEmails(list) {
  const seen = new Set();
  const out = [];
  for (const raw of Array.isArray(list) ? list : []) {
    const email = normalizeEmail(raw);
    if (!email) continue;
    if (seen.has(email)) continue;
    seen.add(email);
    out.push(email);
  }
  return out;
}

function validateEmail(email) {
  if (!email || typeof email !== 'string') return false;
  if (email.length > 120) return false;
  if (!email.includes('@')) return false;
  return true;
}

function normalizeSubscriberLabel(value) {
  const v = String(value || '').trim().toLowerCase();
  if (v === 'guest') return 'guest';
  return 'subscriber';
}

function normalizeName(value) {
  const v = String(value || '').trim();
  if (!v) return '';
  return v.length > 60 ? v.slice(0, 60) : v;
}

async function getNewsletterSubscriberLabels(env) {
  if (!env.SCHEDULE_CONFIG) return { ok: false, status: 501, error: 'Newsletter storage not configured' };

  try {
    const value = await env.SCHEDULE_CONFIG.get('newsletter:subscriberLabels', { type: 'json' });
    const map = value && typeof value === 'object' ? value : {};
    return { ok: true, status: 200, map };
  } catch (e) {
    console.warn('newsletter labels read failed', e);
    return { ok: false, status: 500, error: 'Failed to read subscriber labels' };
  }
}

async function setNewsletterSubscriberLabels(env, map) {
  if (!env.SCHEDULE_CONFIG) return { ok: false, status: 501, error: 'Newsletter storage not configured' };

  try {
    const safe = map && typeof map === 'object' ? map : {};
    await env.SCHEDULE_CONFIG.put('newsletter:subscriberLabels', JSON.stringify(safe));
    return { ok: true, status: 200 };
  } catch (e) {
    console.warn('newsletter labels write failed', e);
    return { ok: false, status: 500, error: 'Failed to save subscriber labels' };
  }
}

async function getNewsletterSubscriberNames(env) {
  if (!env.SCHEDULE_CONFIG) return { ok: false, status: 501, error: 'Newsletter storage not configured' };
  try {
    const value = await env.SCHEDULE_CONFIG.get('newsletter:subscriberNames', { type: 'json' });
    const map = value && typeof value === 'object' ? value : {};
    return { ok: true, status: 200, map };
  } catch (e) {
    console.warn('newsletter subscriberNames read failed', e);
    return { ok: false, status: 500, error: 'Failed to read subscriber names' };
  }
}

async function setNewsletterSubscriberNames(env, map) {
  if (!env.SCHEDULE_CONFIG) return { ok: false, status: 501, error: 'Newsletter storage not configured' };
  try {
    const safe = map && typeof map === 'object' ? map : {};
    await env.SCHEDULE_CONFIG.put('newsletter:subscriberNames', JSON.stringify(safe));
    return { ok: true, status: 200 };
  } catch (e) {
    console.warn('newsletter subscriberNames write failed', e);
    return { ok: false, status: 500, error: 'Failed to save subscriber names' };
  }
}

async function addInviteRecipientToNewsletterBestEffort(env, { email, name }) {
  const normalizedEmail = normalizeEmail(email);
  const normalizedName = normalizeName(name);
  if (!validateEmail(normalizedEmail)) return { ok: true, skipped: true };

  // Best-effort only: invite creation should still succeed even if newsletter storage is unavailable.
  try {
    const current = await getNewsletterSubscribers(env);
    if (current.ok) {
      await setNewsletterSubscribers(env, [...(current.subscribers || []), normalizedEmail]);
    }

    if (normalizedName) {
      const names = await getNewsletterSubscriberNames(env);
      if (names.ok) {
        const map = names.map && typeof names.map === 'object' ? names.map : {};
        map[normalizedEmail] = normalizedName;
        await setNewsletterSubscriberNames(env, map);
      }
    }

    const labels = await getNewsletterSubscriberLabels(env);
    if (labels.ok) {
      const map = labels.map && typeof labels.map === 'object' ? labels.map : {};
      map[normalizedEmail] = 'guest';
      await setNewsletterSubscriberLabels(env, map);
    }
  } catch (e) {
    console.warn('invite newsletter add failed', e);
  }

  return { ok: true };
}

async function getNewsletterSubscribers(env) {
  if (!env.SCHEDULE_CONFIG) return { ok: false, status: 501, error: 'Newsletter storage not configured' };

  try {
    const value = await env.SCHEDULE_CONFIG.get('newsletter:subscribers', { type: 'json' });
    const subscribers = dedupeEmails(Array.isArray(value) ? value : []);
    return { ok: true, status: 200, subscribers };
  } catch (e) {
    console.error('newsletter subscribers read failed', e);
    return { ok: false, status: 500, error: 'Failed to read subscribers' };
  }
}

async function setNewsletterSubscribers(env, subscribers) {
  if (!env.SCHEDULE_CONFIG) return { ok: false, status: 501, error: 'Newsletter storage not configured' };

  const list = dedupeEmails(subscribers).filter(validateEmail);

  if (list.length > 5000) return { ok: false, status: 400, error: 'Too many subscribers (max 5000)' };

  try {
    await env.SCHEDULE_CONFIG.put('newsletter:subscribers', JSON.stringify(list));
    return { ok: true, status: 200, subscribers: list };
  } catch (e) {
    console.error('newsletter subscribers write failed', e);
    return { ok: false, status: 500, error: 'Failed to save subscribers' };
  }
}

async function deleteNewsletterSubscribers(env, emails) {
  if (!env.SCHEDULE_CONFIG) return { ok: false, status: 501, error: 'Newsletter storage not configured' };

  const requested = new Set(dedupeEmails(emails).filter(validateEmail));
  if (requested.size === 0) return { ok: false, status: 400, error: 'Select at least one subscriber to delete' };

  const current = await getNewsletterSubscribers(env);
  if (!current.ok) return current;

  const subscribers = current.subscribers.filter((email) => !requested.has(email));
  try {
    await env.SCHEDULE_CONFIG.put('newsletter:subscribers', JSON.stringify(subscribers));

    for (const [key, defaultValue] of [
      ['newsletter:subscriberLabels', {}],
      ['newsletter:subscriberNames', {}],
    ]) {
      try {
        const value = await env.SCHEDULE_CONFIG.get(key, { type: 'json' });
        const map = value && typeof value === 'object' ? { ...value } : defaultValue;
        for (const email of requested) delete map[email];
        await env.SCHEDULE_CONFIG.put(key, JSON.stringify(map));
      } catch (error) {
        console.warn(`newsletter metadata cleanup failed for ${key}`, error);
      }
    }

    return { ok: true, status: 200, subscribers, deleted: current.subscribers.length - subscribers.length };
  } catch (e) {
    console.error('newsletter subscribers delete failed', e);
    return { ok: false, status: 500, error: 'Failed to delete subscribers' };
  }
}


function getBearerToken(request) {
  const header = request.headers.get('Authorization') || '';
  const m = header.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : '';
}

function normalizeAvailability(input) {
  const raw = input && typeof input === 'object' ? input : {};

  const timezone = String(raw.timezone || 'America/Chicago').trim() || 'America/Chicago';
  const slotDurationMinutes = Number(raw.slotDurationMinutes || 30);
  const daysAhead = Number(raw.daysAhead || 14);
  const startDaysFromNow = Number(raw.startDaysFromNow || 1);

  const days = Array.isArray(raw.days) ? raw.days : [];
  const normalizedDays = Array.from({ length: 7 }).map((_, idx) => {
    const d = days[idx] && typeof days[idx] === 'object' ? days[idx] : {};
    return {
      enabled: Boolean(d.enabled),
      start: String(d.start || '09:00'),
      end: String(d.end || '17:00'),
    };
  });

  return {
    timezone,
    slotDurationMinutes: Number.isFinite(slotDurationMinutes) ? slotDurationMinutes : 30,
    daysAhead: Number.isFinite(daysAhead) ? daysAhead : 14,
    startDaysFromNow: Number.isFinite(startDaysFromNow) ? startDaysFromNow : 1,
    days: normalizedDays,
  };
}

async function readAvailability(env) {
  const kv = env.SCHEDULE_CONFIG;
  if (!kv) return { ok: false, error: 'Schedule config storage not configured', status: 501 };

  try {
    const value = await kv.get('availability', { type: 'json' });
    if (!value) return { ok: true, availability: null };
    return { ok: true, availability: normalizeAvailability(value) };
  } catch (e) {
    console.error('SCHEDULE_CONFIG availability read failed', e);
    return { ok: false, error: 'Failed to read availability', status: 500 };
  }
}

async function writeAvailability(env, availability) {
  const kv = env.SCHEDULE_CONFIG;
  if (!kv) return { ok: false, error: 'Schedule config storage not configured', status: 501 };

  const normalized = normalizeAvailability(availability);

  try {
    await kv.put('availability', JSON.stringify(normalized));
    return { ok: true, availability: normalized };
  } catch (e) {
    console.error('SCHEDULE_CONFIG availability write failed', e);
    return { ok: false, error: 'Failed to save availability', status: 500 };
  }
}

function base64UrlEncode(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  // btoa is available in Workers.
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function generateToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

async function createInviteToken(env, { email, days, name }) {
  if (!env.SCHEDULE_TOKENS) {
    return { ok: false, status: 501, error: 'Schedule token storage not configured' };
  }

  const cleanEmail = String(email || '').trim();
  if (!cleanEmail || !cleanEmail.includes('@')) {
    return { ok: false, status: 400, error: 'Invalid email' };
  }

  const cleanName = String(name || '').trim();
  if (!cleanName) {
    return { ok: false, status: 400, error: 'Guest name is required' };
  }
  if (cleanName.length > 80) {
    return { ok: false, status: 400, error: 'Guest name too long (max 80)' };
  }

  const daysNumber = Number(days || 7);
  if (!Number.isFinite(daysNumber) || daysNumber <= 0 || daysNumber > 365) {
    return { ok: false, status: 400, error: 'Invalid days' };
  }

  const token = generateToken();
  const expiresAt = Date.now() + daysNumber * 24 * 60 * 60 * 1000;

  const payload = {
    token,
    email: cleanEmail,
    name: cleanName,
    expiresAt,
    used: false,
  };

  await env.SCHEDULE_TOKENS.put(token, JSON.stringify(payload));
  return { ok: true, token, expiresAt };
}

function buildInviteEmail({ guestName, inviteUrl, expiresAt }) {
  const name = String(guestName || '').trim();
  const url = String(inviteUrl || '').trim();
  const expires = Number(expiresAt);

  const expiresText = Number.isFinite(expires)
    ? new Date(expires).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : '';
  const greeting = name ? `Hi ${name},` : 'Hi,';

  const subject = 'Your Black Bridge Mindset Recording — Choose Your Time';

  const text = `${greeting}\n\nWe here at Black Bridge Mindset Podcast are excited to have you join us on the show. Your story and perspective will bring real value to the community, and we're looking forward to our conversation.\nTo make scheduling easy, we've set aside recording times based on our current availability. Please choose the time that works best for you using the link below:\n\nSchedule your recording:\n${url}\n\nOnce you select a time, you’ll receive a confirmation email. If you have any questions or need a different time, feel free to reply directly. We want this experience to be smooth and enjoyable for you. Looking forward to our conversation.\n\n— Mike${expiresText ? `\n\n(Link expires on ${expiresText})` : ''}`;

  const ctaButton = renderBbmButtonHtml({
    hrefEscaped: escapeHtml(url),
    labelEscaped: 'Schedule your recording',
  });

  const html = wrapBbmEmailHtml({
    title: subject,
    preheader: 'Choose a time for your recording',
    contentHtml: `
      <p style="margin:0 0 12px 0;">${escapeHtml(greeting)}</p>
      <p style="margin:0 0 12px 0;">We here at Black Bridge Mindset Podcast are excited to have you join us on the show. Your story and perspective will bring real value to the community, and we're looking forward to our conversation.</p>
      <p style="margin:0 0 12px 0;">To make scheduling easy, we've set aside recording times based on our current availability. Please choose the time that works best for you using the link below:</p>
      <div style="margin:0 0 12px 0;">${ctaButton}</div>
      <p style="margin:0 0 12px 0; ${bbmLinkStyle()}"><a style="${bbmLinkStyle()}" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(url)}</a></p>
      <p style="margin:0 0 12px 0;">Once you select a time, you’ll receive a confirmation email. If you have any questions or need a different time, feel free to reply directly. We want this experience to be smooth and enjoyable for you. Looking forward to our conversation.</p>
      <p style="margin:0;">— Mike</p>
      ${expiresText ? `<p style="margin:10px 0 0 0; color:#bdbdbd; font-size:12px;">(Link expires on ${escapeHtml(expiresText)})</p>` : ''}
    `,
  });

  return { subject, text, html };
}

function getRequestHost(request) {
  const url = new URL(request.url);
  return url.host;
}

function parseAllowedHosts(env) {
  const raw = String(env.SCHEDULE_ADMIN_ALLOWED_HOSTS || '').trim();
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function parseAllowedOrigins(env) {
  const raw = String(env.ALLOWED_ORIGINS || '').trim();
  if (!raw) return [];
  if (raw === '*') return ['*'];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function isLocalhostOrigin(origin) {
  if (!origin) return false;
  try {
    const u = new URL(origin);
    return (
      (u.protocol === 'http:' || u.protocol === 'https:') &&
      (u.hostname === 'localhost' || u.hostname === '127.0.0.1' || u.hostname === '::1')
    );
  } catch {
    return false;
  }
}

function getPublicSiteOrigin(env, fallbackHost) {
  const explicit = String(env.SCHEDULE_PUBLIC_ORIGIN || '').trim();
  if (explicit) return explicit.replace(/\/+$/, '');

  const allowed = parseAllowedOrigins(env);
  const first = allowed.find((o) => o && o !== '*');
  if (first) return String(first).replace(/\/+$/, '');

  const host = String(fallbackHost || '').trim();
  return host ? `https://${host}` : '';
}

async function requireAdminSession(request, env, corsHeaders) {
  const session = await verifyAdminSession(request, env);
  if (session.ok) return session;

  // Local dev fallback: allow bearer token.
  if (isDevMode(env)) {
    const expected = String(env.SCHEDULE_ADMIN_TOKEN || '').trim();
    if (expected) {
      const got = getBearerToken(request);
      if (got && got === expected) return { ok: true, email: 'dev-token' };
    }
  }

  return { ok: false, response: unauthorized(corsHeaders) };
}

function enforceAdminHost(request, env, corsHeaders) {
  // If you protect /api/schedule/admin/* with Cloudflare Access on your custom domain,
  // the public *.workers.dev hostname can become a bypass unless we block it here.
  const host = getRequestHost(request).toLowerCase();

  if (isDevMode(env)) {
    // Allow localhost and workers.dev during local development.
    return null;
  }

  if (host.endsWith('.workers.dev')) {
    return jsonResponse({ ok: false, error: 'Forbidden' }, { status: 403, headers: corsHeaders });
  }

  const allowedHosts = parseAllowedHosts(env);
  if (allowedHosts.length > 0 && !allowedHosts.includes(host)) {
    return jsonResponse({ ok: false, error: 'Forbidden' }, { status: 403, headers: corsHeaders });
  }

  return null;
}

function inviteUrlForRequest(request, env, fallbackHost, token) {
  // Prefer the page origin that initiated the invite creation.
  // This keeps local dev invites on localhost, and production invites on the real domain.
  const reqOrigin = String(request.headers.get('Origin') || '').trim();
  const allowed = parseAllowedOrigins(env);
  const devMode = isDevMode(env);

  const originAllowed =
    (allowed.includes('*') && Boolean(reqOrigin)) ||
    (reqOrigin && allowed.includes(reqOrigin)) ||
    (devMode && isLocalhostOrigin(reqOrigin));

  const origin = originAllowed ? reqOrigin.replace(/\/+$/, '') : getPublicSiteOrigin(env, fallbackHost);
  return `${origin}/schedule/${token}`;
}

export async function handleAdmin(request, env, corsHeaders) {
  const hostError = enforceAdminHost(request, env, corsHeaders);
  if (hostError) return hostError;

  const authResult = await requireAdminSession(request, env, corsHeaders);
  if (!authResult.ok) return authResult.response;
  const actorEmail = authResult.email || '';

  const url = new URL(request.url);

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ ok: false, error: 'Invalid JSON' }, { status: 400, headers: corsHeaders });
  }

  if (url.pathname === '/api/schedule/admin/submissions/list') {
    const result = await listSubmissions(env, body?.status || 'all');
    if (!result.ok) return jsonResponse({ ok: false, error: result.error }, { status: result.status, headers: corsHeaders });
    return jsonResponse({ ok: true, submissions: result.submissions }, { status: 200, headers: corsHeaders });
  }

  if (url.pathname === '/api/schedule/admin/submissions/update') {
    const result = await updateSubmissionStatus(env, { id: body?.id, status: body?.status, actorEmail });
    if (!result.ok) return jsonResponse({ ok: false, error: result.error }, { status: result.status, headers: corsHeaders });
    return jsonResponse({ ok: true }, { status: 200, headers: corsHeaders });
  }

  if (url.pathname === '/api/schedule/admin/activity/list') {
    const result = await listActivity(env);
    if (!result.ok) return jsonResponse({ ok: false, error: result.error }, { status: result.status, headers: corsHeaders });
    return jsonResponse({ ok: true, activity: result.activity }, { status: 200, headers: corsHeaders });
  }

  if (url.pathname === '/api/schedule/admin/availability/get') {
    const res = await readAvailability(env);
    if (!res.ok) return jsonResponse({ ok: false, error: res.error }, { status: res.status, headers: corsHeaders });
    return jsonResponse({ ok: true, availability: res.availability }, { status: 200, headers: corsHeaders });
  }

  if (url.pathname === '/api/schedule/admin/availability/set') {
    const res = await writeAvailability(env, body?.availability);
    if (!res.ok) return jsonResponse({ ok: false, error: res.error }, { status: res.status, headers: corsHeaders });
    await recordActivity(env, {
      action: 'availability.updated',
      entityType: 'schedule',
      actorEmail,
      detail: { timezone: res.availability?.timezone || '' },
    });
    return jsonResponse({ ok: true, availability: res.availability }, { status: 200, headers: corsHeaders });
  }

  if (url.pathname === '/api/schedule/admin/invite') {
    const created = await createInviteToken(env, { email: body?.email, days: body?.days, name: body?.name });
    if (!created.ok) {
      return jsonResponse({ ok: false, error: created.error }, { status: created.status, headers: corsHeaders });
    }

    const host = getRequestHost(request);
    const inviteUrl = inviteUrlForRequest(request, env, host, created.token);

    const fromEmail = String(env.EMAIL_FROM || '').trim();
    const fromName = String(env.FROM_NAME || 'Black Bridge Mindset').trim();
    if (!fromEmail) return jsonResponse({ ok: false, error: 'Email service not configured' }, { status: 500, headers: corsHeaders });

    const guestEmail = normalizeEmail(body?.email);
    const guestName = String(body?.name || '').trim();
    const { subject, text, html } = buildInviteEmail({ guestName, inviteUrl, expiresAt: created.expiresAt });

    try {
      await sendEmail(env, {
        to: [guestEmail],
        fromEmail,
        fromName,
        subject,
        text,
        html,
      });
    } catch (e) {
      return jsonResponse(
        { ok: false, error: e instanceof Error ? e.message : 'Failed to send invite email' },
        { status: 502, headers: corsHeaders }
      );
    }

    await addInviteRecipientToNewsletterBestEffort(env, { email: guestEmail, name: guestName });
    await recordActivity(env, {
      action: 'invite.created',
      entityType: 'invite',
      entityId: String(created.token || '').slice(0, 12),
      actorEmail,
      detail: { guestEmail, expiresAt: created.expiresAt },
    });

    return jsonResponse(
      {
        ok: true,
        token: created.token,
        expiresAt: created.expiresAt,
        inviteUrl,
      },
      { status: 200, headers: corsHeaders }
    );
  }

  if (url.pathname === '/api/schedule/admin/newsletter/subscribers/get') {
    const res = await getNewsletterSubscribers(env);
    if (!res.ok) return jsonResponse({ ok: false, error: res.error }, { status: res.status, headers: corsHeaders });

    const labelsRes = await getNewsletterSubscriberLabels(env);
    const labelsMap = labelsRes.ok && labelsRes.map && typeof labelsRes.map === 'object' ? labelsRes.map : {};
    const safeLabels = {};
    for (const email of res.subscribers || []) {
      safeLabels[email] = normalizeSubscriberLabel(labelsMap[email]);
    }

    return jsonResponse({ ok: true, subscribers: res.subscribers, labels: safeLabels }, { status: 200, headers: corsHeaders });
  }

  if (url.pathname === '/api/schedule/admin/newsletter/subscribers/set') {
    const res = await setNewsletterSubscribers(env, body?.subscribers);
    if (!res.ok) return jsonResponse({ ok: false, error: res.error }, { status: res.status, headers: corsHeaders });

    await recordActivity(env, {
      action: 'newsletter.subscribers.saved',
      entityType: 'newsletter_subscribers',
      actorEmail,
      detail: { count: res.subscribers.length },
    });

    // Best-effort: keep a labels map aligned to the saved list.
    try {
      const labelsRes = await getNewsletterSubscriberLabels(env);
      const labelsMap = labelsRes.ok && labelsRes.map && typeof labelsRes.map === 'object' ? labelsRes.map : {};
      const next = {};
      for (const email of res.subscribers || []) {
        next[email] = normalizeSubscriberLabel(labelsMap[email]);
      }
      await setNewsletterSubscriberLabels(env, next);
      return jsonResponse({ ok: true, subscribers: res.subscribers, labels: next }, { status: 200, headers: corsHeaders });
    } catch (e) {
      console.warn('newsletter labels sync failed', e);
      return jsonResponse({ ok: true, subscribers: res.subscribers }, { status: 200, headers: corsHeaders });
    }
  }

  if (url.pathname === '/api/schedule/admin/newsletter/subscribers/delete') {
    const res = await deleteNewsletterSubscribers(env, body?.subscribers);
    if (!res.ok) return jsonResponse({ ok: false, error: res.error }, { status: res.status, headers: corsHeaders });

    await recordActivity(env, {
      action: 'newsletter.subscribers.deleted',
      entityType: 'newsletter_subscribers',
      actorEmail,
      detail: { deleted: res.deleted, remaining: res.subscribers.length },
    });
    return jsonResponse({ ok: true, subscribers: res.subscribers, deleted: res.deleted }, { status: 200, headers: corsHeaders });
  }

  if (url.pathname === '/api/schedule/admin/newsletter/campaigns/list') {
    const res = await listNewsletterCampaigns(env);
    if (!res.ok) return jsonResponse({ ok: false, error: res.error }, { status: res.status, headers: corsHeaders });
    return jsonResponse({ ok: true, campaigns: res.campaigns }, { status: 200, headers: corsHeaders });
  }

  if (url.pathname === '/api/schedule/admin/newsletter/campaigns/save') {
    const res = await saveNewsletterCampaign(env, {
      id: body?.id,
      subject: body?.subject,
      content: body?.content,
      status: body?.status,
      scheduledAt: body?.scheduledAt,
      actorEmail,
    });
    if (!res.ok) return jsonResponse({ ok: false, error: res.error }, { status: res.status, headers: corsHeaders });
    return jsonResponse({ ok: true, campaign: res.campaign }, { status: 200, headers: corsHeaders });
  }

  if (url.pathname === '/api/schedule/admin/newsletter/campaigns/delete') {
    const res = await deleteNewsletterCampaign(env, { id: body?.id, actorEmail });
    if (!res.ok) return jsonResponse({ ok: false, error: res.error }, { status: res.status, headers: corsHeaders });
    return jsonResponse({ ok: true }, { status: 200, headers: corsHeaders });
  }

  if (url.pathname === '/api/schedule/admin/newsletter/send') {
    const rawSubject = String(body?.subject || '').trim();
    const rawMessage = String(body?.message || '').trim();

    if (!rawSubject) return jsonResponse({ ok: false, error: 'Subject is required' }, { status: 400, headers: corsHeaders });
    if (rawSubject.length > 150) {
      return jsonResponse({ ok: false, error: 'Subject too long (max 150)' }, { status: 400, headers: corsHeaders });
    }
    if (!rawMessage) return jsonResponse({ ok: false, error: 'Message is required' }, { status: 400, headers: corsHeaders });
    if (rawMessage.length > 20000) {
      return jsonResponse({ ok: false, error: 'Message too long (max 20000 characters)' }, { status: 400, headers: corsHeaders });
    }

    const fromEmail = String(env.EMAIL_FROM || '').trim();
    const fromName = String(env.FROM_NAME || 'Black Bridge Mindset').trim();
    if (!fromEmail) return jsonResponse({ ok: false, error: 'Email service not configured' }, { status: 500, headers: corsHeaders });

    const testEmail = normalizeEmail(body?.testEmail);
    let recipients = [];

    if (testEmail) {
      if (!validateEmail(testEmail)) {
        return jsonResponse({ ok: false, error: 'Invalid test email' }, { status: 400, headers: corsHeaders });
      }
      recipients = [testEmail];
    } else {
      const provided = dedupeEmails(body?.recipients).filter(validateEmail);
      if (provided.length > 0) {
        recipients = provided;
      } else {
        const stored = await getNewsletterSubscribers(env);
        if (!stored.ok) {
          return jsonResponse({ ok: false, error: stored.error }, { status: stored.status, headers: corsHeaders });
        }
        recipients = stored.subscribers;
      }
    }

    if (recipients.length === 0) {
      return jsonResponse({ ok: false, error: 'No recipients' }, { status: 400, headers: corsHeaders });
    }

    // Keep individual API calls bounded.
    if (recipients.length > 200) {
      return jsonResponse({ ok: false, error: 'Too many recipients in one request (max 200)' }, { status: 400, headers: corsHeaders });
    }

    const campaignId = String(body?.campaignId || '').trim();
    const { subject, text, html, content } = buildNewsletterEmail({
      subject: rawSubject,
      content: body?.content,
      message: rawMessage,
      env,
    });

    try {
      await sendEmail(env, {
        to: recipients,
        fromEmail,
        fromName,
        subject,
        text,
        html,
      });
      if (campaignId && env.SCHEDULE_DB) {
        await env.SCHEDULE_DB
          .prepare("UPDATE newsletter_campaigns SET status = 'sent', sentAt = ?1, recipientCount = ?2, updatedAt = ?1, errorMessage = NULL WHERE id = ?3")
          .bind(Date.now(), recipients.length, campaignId)
          .run();
      }
      await recordActivity(env, {
        action: 'newsletter.sent',
        entityType: 'newsletter',
        entityId: campaignId,
        actorEmail,
        detail: { recipients: recipients.length, subject: rawSubject, preheader: content.preheader },
      });
      return jsonResponse({ ok: true, recipients: recipients.length }, { status: 200, headers: corsHeaders });
    } catch (e) {
      await recordActivity(env, {
        action: 'newsletter.send.failed',
        entityType: 'newsletter',
        entityId: campaignId,
        actorEmail,
        detail: { recipients: recipients.length, subject: rawSubject, error: e instanceof Error ? e.message : 'Failed to send email' },
      });
      return jsonResponse(
        { ok: false, error: e instanceof Error ? e.message : 'Failed to send email' },
        { status: 502, headers: corsHeaders }
      );
    }
  }

  if (url.pathname === '/api/schedule/admin/booking/cancel') {
    const bookingId = String(body?.bookingId || '').trim();
    if (!bookingId) {
      return jsonResponse({ ok: false, error: 'Booking ID is required' }, { status: 400, headers: corsHeaders });
    }

    if (!env.SCHEDULE_DB) {
      return jsonResponse({ ok: false, error: 'Booking database not configured' }, { status: 501, headers: corsHeaders });
    }

    try {
      const result = await env.SCHEDULE_DB
        .prepare('UPDATE bookings SET status = ?1 WHERE id = ?2')
        .bind('cancelled', bookingId)
        .run();

      if (result.meta.changes === 0) {
        return jsonResponse({ ok: false, error: 'Booking not found' }, { status: 404, headers: corsHeaders });
      }

      await recordActivity(env, {
        action: 'booking.cancelled',
        entityType: 'booking',
        entityId: bookingId,
        actorEmail,
      });

      return jsonResponse({ ok: true }, { status: 200, headers: corsHeaders });
    } catch (e) {
      console.error('Failed to cancel booking', e);
      return jsonResponse(
        { ok: false, error: e instanceof Error ? e.message : 'Failed to cancel booking' },
        { status: 500, headers: corsHeaders }
      );
    }
  }

  if (url.pathname === '/api/schedule/admin/bookings/list') {
    if (!env.SCHEDULE_DB) {
      return jsonResponse({ ok: false, error: 'Booking database not configured' }, { status: 501, headers: corsHeaders });
    }

    try {
      const result = await env.SCHEDULE_DB
        .prepare('SELECT id, name, email, datetime, notes, status, createdAt FROM bookings ORDER BY datetime ASC')
        .all();

      return jsonResponse({ ok: true, bookings: result.results || [] }, { status: 200, headers: corsHeaders });
    } catch (e) {
      console.error('Failed to list bookings', e);
      return jsonResponse(
        { ok: false, error: e instanceof Error ? e.message : 'Failed to list bookings' },
        { status: 500, headers: corsHeaders }
      );
    }
  }

  return jsonResponse({ ok: false, error: 'Not found' }, { status: 404, headers: corsHeaders });
}
