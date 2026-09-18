import { sendEmail } from '../../email';
import { wrapBbmEmailHtml } from '../../emailTheme';
import { getNewsletterUnsubscribeUrl } from './newsletterUnsubscribe';

function jsonResponse(body, { status = 200, headers = {} } = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...headers,
    },
  });
}

function normalizeEmail(value) {
  const v = String(value || '').trim().toLowerCase();
  if (!v) return '';
  return v;
}

function validateEmail(email) {
  if (!email || typeof email !== 'string') return false;
  if (email.length > 120) return false;
  if (!email.includes('@')) return false;
  if (email.includes(' ')) return false;
  return true;
}

function normalizeName(value) {
  const v = String(value || '').trim();
  if (!v) return '';
  return v.length > 60 ? v.slice(0, 60) : v;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

async function getSubscriberNames(env) {
  if (!env.SCHEDULE_CONFIG) return { ok: false, status: 501, error: 'Newsletter storage not configured' };
  const value = await env.SCHEDULE_CONFIG.get('newsletter:subscriberNames', { type: 'json' });
  const map = value && typeof value === 'object' ? value : {};
  return { ok: true, status: 200, map };
}

async function setSubscriberNames(env, map) {
  if (!env.SCHEDULE_CONFIG) return { ok: false, status: 501, error: 'Newsletter storage not configured' };
  const safe = map && typeof map === 'object' ? map : {};
  await env.SCHEDULE_CONFIG.put('newsletter:subscriberNames', JSON.stringify(safe));
  return { ok: true, status: 200 };
}

async function getSubscriberLabels(env) {
  if (!env.SCHEDULE_CONFIG) return { ok: false, status: 501, error: 'Newsletter storage not configured' };
  const value = await env.SCHEDULE_CONFIG.get('newsletter:subscriberLabels', { type: 'json' });
  const map = value && typeof value === 'object' ? value : {};
  return { ok: true, status: 200, map };
}

async function setSubscriberLabels(env, map) {
  if (!env.SCHEDULE_CONFIG) return { ok: false, status: 501, error: 'Newsletter storage not configured' };
  const safe = map && typeof map === 'object' ? map : {};
  await env.SCHEDULE_CONFIG.put('newsletter:subscriberLabels', JSON.stringify(safe));
  return { ok: true, status: 200 };
}

function buildWelcomeEmail({ firstName, unsubscribeUrl }) {
  const fn = String(firstName || '').trim();
  const greeting = fn ? `Hi ${fn},` : 'Hi,';

  const subject = 'Welcome to the Black Bridge Mindset Community';

  const text = `${greeting}\n\nThank you for subscribing to the Black Bridge Mindset Podcast. You’re officially part of a community committed to growth, resilience, and building the mindset that carries you across every bridge in life. I’m grateful you’re here. If you ever want to share your story, ask a question, or suggest a guest, just reply to this email. This platform grows stronger with every voice that joins it.\nWelcome to the bridge.\n\n— Mike, Host of Black Bridge Mindset\n\nManage your subscription: ${unsubscribeUrl}`;

  const html = wrapBbmEmailHtml({
    title: subject,
    preheader: 'Welcome to the Black Bridge Mindset community',
    contentHtml: `
      <p style="margin:0 0 12px 0;">${escapeHtml(greeting)}</p>
      <p style="margin:0 0 12px 0;">Thank you for subscribing to the Black Bridge Mindset Podcast. You’re officially part of a community committed to growth, resilience, and building the mindset that carries you across every bridge in life. I’m grateful you’re here. If you ever want to share your story, ask a question, or suggest a guest, just reply to this email. This platform grows stronger with every voice that joins it.</p>
      <p style="margin:0 0 12px 0;">Welcome to the bridge.</p>
      <p style="margin:0;">— Mike, Host of Black Bridge Mindset</p>
      <p style="margin:24px 0 0; padding-top:16px; border-top:1px solid #35414d; color:#bfc7cf; font-size:12px; line-height:1.5;">You’re receiving this because you joined the Black Bridge Mindset community. <a href="${escapeHtml(unsubscribeUrl)}" style="color:#f7c873; text-decoration:underline;">Unsubscribe</a></p>
    `,
  });

  return { subject, text, html };
}

function dedupeEmails(list) {
  const out = [];
  const seen = new Set();

  for (const raw of Array.isArray(list) ? list : []) {
    const email = normalizeEmail(raw);
    if (!email) continue;
    if (seen.has(email)) continue;
    seen.add(email);
    out.push(email);
  }

  return out;
}

async function getSubscribers(env) {
  if (!env.SCHEDULE_CONFIG) return { ok: false, status: 501, error: 'Newsletter storage not configured' };
  const value = await env.SCHEDULE_CONFIG.get('newsletter:subscribers', { type: 'json' });
  const subscribers = dedupeEmails(Array.isArray(value) ? value : []);
  return { ok: true, status: 200, subscribers };
}

async function setSubscribers(env, subscribers) {
  if (!env.SCHEDULE_CONFIG) return { ok: false, status: 501, error: 'Newsletter storage not configured' };
  const list = dedupeEmails(subscribers).filter(validateEmail);
  if (list.length > 5000) return { ok: false, status: 400, error: 'Too many subscribers (max 5000)' };
  await env.SCHEDULE_CONFIG.put('newsletter:subscribers', JSON.stringify(list));
  return { ok: true, status: 200, subscribers: list };
}

export async function handleNewsletterSubscribe(request, env, corsHeaders) {
  let body = null;
  try {
    body = await request.json();
  } catch {
    body = null;
  }

  const email = normalizeEmail(body?.email);
  const firstName = normalizeName(body?.firstName);
  const lastName = normalizeName(body?.lastName);
  if (!validateEmail(email)) {
    return jsonResponse({ ok: false, error: 'Please provide a valid email.' }, { status: 400, headers: corsHeaders });
  }

  try {
    const current = await getSubscribers(env);
    if (!current.ok) {
      return jsonResponse({ ok: false, error: current.error || 'Failed to read subscribers' }, { status: current.status || 500, headers: corsHeaders });
    }

    const next = dedupeEmails([...(current.subscribers || []), email]);
    const saved = await setSubscribers(env, next);
    if (!saved.ok) {
      return jsonResponse({ ok: false, error: saved.error || 'Failed to save subscriber' }, { status: saved.status || 500, headers: corsHeaders });
    }

    // Best-effort: persist name metadata separately (keeps subscriber list compatible with admin mail blast).
    try {
      const names = await getSubscriberNames(env);
      if (names.ok) {
        const map = names.map || {};
        map[email] = {
          firstName,
          lastName,
          updatedAt: Date.now(),
        };
        await setSubscriberNames(env, map);
      }
    } catch (e) {
      console.warn('newsletter name save failed', e);
    }

    // Best-effort: mark label as subscriber.
    try {
      const labels = await getSubscriberLabels(env);
      if (labels.ok) {
        const map = labels.map || {};
        map[email] = 'subscriber';
        await setSubscriberLabels(env, map);
      }
    } catch (e) {
      console.warn('newsletter label save failed', e);
    }

    // Best-effort: send welcome email (from template).
    try {
      const fromEmail = String(env.EMAIL_FROM || '').trim();
      const fromName = String(env.FROM_NAME || 'Black Bridge Mindset').trim();
      if (fromEmail) {
        const { subject, text, html } = buildWelcomeEmail({ firstName, unsubscribeUrl: getNewsletterUnsubscribeUrl(env) });
        await sendEmail(env, {
          to: [email],
          fromEmail,
          fromName,
          subject,
          text,
          html,
        });
      }
    } catch (e) {
      console.warn('welcome email send failed', e);
    }

    return jsonResponse({ ok: true, email }, { status: 200, headers: corsHeaders });
  } catch (e) {
    console.error('newsletter subscribe failed', e);
    return jsonResponse({ ok: false, error: 'Failed to subscribe.' }, { status: 500, headers: corsHeaders });
  }
}
