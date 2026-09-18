import { recordActivity } from '../../shared/submissions';

export const DEFAULT_NEWSLETTER_UNSUBSCRIBE_URL = 'https://blackbridgemindset.com/api/schedule/newsletter/unsubscribe';

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function isValidEmail(email) {
  return Boolean(email) && email.length <= 120 && email.includes('@') && !email.includes(' ');
}

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function htmlResponse(html, status = 200) {
  return new Response(`<!doctype html>${html}`, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
    },
  });
}

function renderPage({ title, heading, message, showForm = false, email = '' }) {
  const form = showForm
    ? `
      <form method="post" style="margin-top:24px;">
        <label style="display:block; color:#c9d1d9; font-size:14px; font-weight:700;" for="email">Email address</label>
        <input id="email" name="email" type="email" value="${escapeHtml(email)}" required autocomplete="email" style="display:block; width:100%; box-sizing:border-box; margin-top:8px; padding:12px 13px; border:1px solid #465360; border-radius:8px; background:#121a22; color:#f5f7fa; font:inherit;" />
        <button type="submit" style="margin-top:14px; padding:11px 16px; border:1px solid #f7c873; border-radius:9px; background:#f7c873; color:#171b20; cursor:pointer; font:inherit; font-weight:800;">Unsubscribe</button>
      </form>
    `
    : '';

  return `
    <html lang="en">
      <head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>${escapeHtml(title)}</title></head>
      <body style="margin:0; padding:32px 16px; background:#07090b; color:#f5f7fa; font-family:Arial, Helvetica, sans-serif;">
        <main style="width:min(100%, 560px); box-sizing:border-box; margin:0 auto; padding:28px; border:1px solid #35414d; border-radius:14px; background:#121a22;">
          <div style="color:#f7c873; font-size:12px; font-weight:800; letter-spacing:3px; text-transform:uppercase;">Black Bridge Mindset</div>
          <h1 style="margin:20px 0 10px; color:#f5f7fa; font-family:Georgia, 'Times New Roman', serif; font-size:28px; line-height:1.2;">${escapeHtml(heading)}</h1>
          <p style="margin:0; color:#d5dbe0; font-size:15px; line-height:1.65;">${escapeHtml(message)}</p>
          ${form}
          <p style="margin:26px 0 0; color:#bfc7cf; font-size:12px; line-height:1.5;">Black Bridge Mindset · Keep building. Keep crossing.</p>
        </main>
      </body>
    </html>
  `;
}

export function getNewsletterUnsubscribeUrl(env) {
  const configured = String(env?.NEWSLETTER_UNSUBSCRIBE_URL || '').trim();
  return configured || DEFAULT_NEWSLETTER_UNSUBSCRIBE_URL;
}

async function removeSubscriber(env, email) {
  if (!env.SCHEDULE_CONFIG) return { ok: false, status: 501, error: 'Newsletter storage not configured' };

  const currentValue = await env.SCHEDULE_CONFIG.get('newsletter:subscribers', { type: 'json' });
  const current = Array.isArray(currentValue) ? currentValue.map(normalizeEmail).filter(isValidEmail) : [];
  const next = current.filter((subscriber) => subscriber !== email);
  const removed = next.length !== current.length;

  if (removed) await env.SCHEDULE_CONFIG.put('newsletter:subscribers', JSON.stringify(next));

  for (const key of ['newsletter:subscriberNames', 'newsletter:subscriberLabels']) {
    try {
      const value = await env.SCHEDULE_CONFIG.get(key, { type: 'json' });
      if (!value || typeof value !== 'object' || !(email in value)) continue;
      delete value[email];
      await env.SCHEDULE_CONFIG.put(key, JSON.stringify(value));
    } catch (error) {
      console.warn(`newsletter unsubscribe metadata cleanup failed for ${key}`, error);
    }
  }

  await recordActivity(env, {
    action: 'newsletter.unsubscribed',
    entityType: 'newsletter_subscriber',
    entityId: email,
    actorEmail: email,
    detail: { removed },
  });

  return { ok: true, removed };
}

export async function handleNewsletterUnsubscribe(request, env) {
  const url = new URL(request.url);
  let email = normalizeEmail(url.searchParams.get('email'));

  if (request.method === 'POST') {
    try {
      const contentType = request.headers.get('Content-Type') || '';
      if (contentType.includes('application/json')) {
        const body = await request.json();
        email = normalizeEmail(body?.email || email);
      } else {
        const form = await request.formData();
        email = normalizeEmail(form.get('email') || email);
      }
    } catch {
      return htmlResponse(
        renderPage({ title: 'Unsubscribe error', heading: 'We could not process that request', message: 'Please try again with the email address that receives Black Bridge Mindset updates.', showForm: true }),
        400
      );
    }
  } else if (request.method !== 'GET') {
    return htmlResponse(renderPage({ title: 'Method not allowed', heading: 'That request is not supported', message: 'Please use the unsubscribe form.' }), 405);
  }

  if (!email) {
    return htmlResponse(
      renderPage({ title: 'Unsubscribe', heading: 'Manage your Black Bridge Mindset emails', message: 'Enter your email address below to stop receiving newsletter updates.', showForm: true })
    );
  }

  if (!isValidEmail(email)) {
    return htmlResponse(
      renderPage({ title: 'Unsubscribe error', heading: 'Enter a valid email address', message: 'Please check the address and try again.', showForm: true, email }),
      400
    );
  }

  try {
    const result = await removeSubscriber(env, email);
    if (!result.ok) return htmlResponse(renderPage({ title: 'Unsubscribe unavailable', heading: 'We could not update your subscription', message: result.error || 'Please try again later.' }), result.status || 500);
    return htmlResponse(
      renderPage({
        title: 'Unsubscribed',
        heading: result.removed ? 'You’re unsubscribed' : 'You’re already unsubscribed',
        message: result.removed
          ? 'You will no longer receive Black Bridge Mindset newsletter updates at this address.'
          : 'That email address is not currently subscribed to Black Bridge Mindset newsletter updates.',
      })
    );
  } catch (error) {
    console.error('newsletter unsubscribe failed', error);
    return htmlResponse(renderPage({ title: 'Unsubscribe error', heading: 'We could not update your subscription', message: 'Please try again later.' }), 500);
  }
}
