import { handleScheduleRequest } from './api/schedule';
import { sendEmail } from './email';
import { wrapBbmEmailHtml, renderBbmMessageBoxHtml, bbmMutedTextStyle } from './emailTheme';
import { jsonResponse, securityHeaders } from './shared/http';
import { escapeHtml } from './shared/sanitize';
import { createContactSubmission, recordActivity, updateContactSubmissionDelivery } from './shared/submissions';
import { processScheduledNewsletters } from './api/schedule/newsletterCampaigns';

function parseAllowedOrigins(env) {
  const raw = String(env.ALLOWED_ORIGINS || '').trim();
  if (!raw) return [];
  if (raw === '*') return ['*'];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function corsHeadersFor(origin, allowedOrigins) {
  if (!origin) return {};

  if (allowedOrigins.includes('*')) {
    return {
      'Access-Control-Allow-Origin': origin,
      'Vary': 'Origin',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    };
  }

  if (allowedOrigins.includes(origin)) {
    return {
      'Access-Control-Allow-Origin': origin,
      'Vary': 'Origin',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    };
  }

  return {};
}

function staticAssetResponse(response) {
  const headers = new Headers(response.headers);
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  headers.set('Permissions-Policy', 'geolocation=(), camera=(), microphone=(), payment=(), usb=()');
  headers.set('X-Frame-Options', 'DENY');
  headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  headers.set(
    'Content-Security-Policy-Report-Only',
    "default-src 'self'; script-src 'self' 'unsafe-inline' https://www.youtube.com https://www.youtube-nocookie.com https://www.googletagmanager.com https://static.cloudflareinsights.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: https:; font-src 'self' https://fonts.gstatic.com data:; frame-src 'self' https://www.youtube.com https://www.youtube-nocookie.com; connect-src 'self' https://www.googleapis.com https://youtube.googleapis.com https://cloudflareinsights.com; object-src 'none'; base-uri 'self'; frame-ancestors 'none'"
  );
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function buildEmail({ name, email, subject, message, ip, ua, origin }) {
  const cleanSubject = subject ? subject : 'New contact form submission';
  const text =
    `New contact form submission\n\n` +
    `Name: ${name}\n` +
    `Email: ${email}\n` +
    `Subject: ${cleanSubject}\n\n` +
    `Message:\n${message}\n\n` +
    `---\n` +
    `Origin: ${origin || ''}\n` +
    `IP: ${ip || ''}\n` +
    `User-Agent: ${ua || ''}\n`;

  const messageBox = renderBbmMessageBoxHtml(
    `<pre style="margin:0; white-space:pre-wrap; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; color:#e0e0e0;">${escapeHtml(message)}</pre>`
  );

  const html = wrapBbmEmailHtml({
    title: 'New contact form submission',
    preheader: `From ${String(name || '').trim()} (${String(email || '').trim()})`,
    contentHtml: `
      <p style="margin:0 0 8px 0;"><b>Name:</b> ${escapeHtml(name)}</p>
      <p style="margin:0 0 8px 0;"><b>Email:</b> ${escapeHtml(email)}</p>
      <p style="margin:0 0 14px 0;"><b>Subject:</b> ${escapeHtml(cleanSubject)}</p>
      ${messageBox}
      <div style="margin-top:14px; ${bbmMutedTextStyle()}">
        <div><b>Origin:</b> ${escapeHtml(origin || '')}</div>
        <div><b>IP:</b> ${escapeHtml(ip || '')}</div>
        <div><b>User-Agent:</b> ${escapeHtml(ua || '')}</div>
      </div>
    `,
  });

  return { subject: `[BBM Contact] ${cleanSubject}`, text, html };
}

async function rateLimit(env, { key, limit, windowSeconds }) {
  if (!env.SCHEDULE_CONFIG) return { ok: true };
  const k = `contact:rl:${key}`;
  const current = Number(await env.SCHEDULE_CONFIG.get(k));
  const next = Number.isFinite(current) ? current + 1 : 1;
  if (next > limit) return { ok: false };
  await env.SCHEDULE_CONFIG.put(k, String(next), { expirationTtl: windowSeconds });
  return { ok: true };
}

async function sendContactEmail(env, { replyToEmail, subject, text, html }) {
  await sendEmail(env, {
    to: env.EMAIL_TO,
    fromEmail: env.EMAIL_FROM,
    fromName: env.FROM_NAME || 'Website',
    replyTo: replyToEmail,
    subject,
    text,
    html,
  });
}

export default {
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(processScheduledNewsletters(env));
  },

  async fetch(request, env) {
    const url = new URL(request.url);

    // Schedule API is fully isolated under worker/src/api/schedule.
    // This early dispatch keeps the existing contact endpoint behavior intact.
    if (url.pathname.startsWith('/api/schedule/')) {
      return handleScheduleRequest(request, env);
    }

    // Cloudflare Worker Static Assets serves the React frontend from the same
    // Worker. API requests continue through the handlers below.
    if (!url.pathname.startsWith('/api/')) {
      if (!env.ASSETS) {
        return new Response('Static assets binding not configured', { status: 500 });
      }
      return staticAssetResponse(await env.ASSETS.fetch(request));
    }

    const origin = request.headers.get('Origin') || '';
    const allowedOrigins = parseAllowedOrigins(env);
    const cors = corsHeadersFor(origin, allowedOrigins);

    // Expect /api/contact (but allow any path as long as POST)
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: { ...securityHeaders(), ...cors } });
    }

    if (request.method !== 'POST') {
      return jsonResponse({ ok: false, error: 'Method not allowed' }, { status: 405, headers: cors });
    }

    // Basic origin enforcement when ALLOWED_ORIGINS is not '*'
    if (!allowedOrigins.includes('*') && origin && !allowedOrigins.includes(origin)) {
      return jsonResponse({ ok: false, error: 'Origin not allowed' }, { status: 403, headers: cors });
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return jsonResponse({ ok: false, error: 'Invalid JSON' }, { status: 400, headers: cors });
    }

    const name = String(body?.name || '').trim();
    const email = String(body?.email || '').trim();
    const subject = String(body?.subject || '').trim();
    const message = String(body?.message || '').trim();

    // Honeypot
    const company = String(body?.company || '').trim();
    if (company) {
      return jsonResponse({ ok: true }, { status: 200, headers: cors });
    }

    // Basic validation
    if (!name || name.length > 80) {
      return jsonResponse({ ok: false, error: 'Please provide your name.' }, { status: 400, headers: cors });
    }
    if (!email || email.length > 120 || !email.includes('@')) {
      return jsonResponse({ ok: false, error: 'Please provide a valid email.' }, { status: 400, headers: cors });
    }
    if (!message || message.length > 4000) {
      return jsonResponse({ ok: false, error: 'Please enter a message (max 4000 characters).' }, { status: 400, headers: cors });
    }

    if (!env.EMAIL_TO || !env.EMAIL_FROM) {
      return jsonResponse({ ok: false, error: 'Email service not configured.' }, { status: 500, headers: cors });
    }

    const ip = request.headers.get('CF-Connecting-IP') || '';
    const ua = request.headers.get('User-Agent') || '';

    // Rate limit: 5 contact form submissions per IP per 10 minutes.
    if (ip) {
      const rl = await rateLimit(env, { key: `ip:${ip}`, limit: 5, windowSeconds: 600 });
      if (!rl.ok) {
        return jsonResponse(
          { ok: false, error: 'Too many requests. Please try again later.' },
          { status: 429, headers: { ...cors, 'Retry-After': '600' } }
        );
      }
    }

    const emailContent = buildEmail({ name, email, subject, message, ip, ua, origin });
    const submissionId = await createContactSubmission(env, {
      name,
      email,
      subject,
      message,
      ip,
      origin,
      userAgent: ua,
      createdAt: Date.now(),
    });

    if (submissionId) {
      await recordActivity(env, {
        action: 'submission.created',
        entityType: 'submission',
        entityId: submissionId,
        detail: { subject: subject || 'New contact form submission' },
      });
    }

    try {
      await sendContactEmail(env, {
        replyToEmail: email,
        subject: emailContent.subject,
        text: emailContent.text,
        html: emailContent.html,
      });
      if (submissionId) await updateContactSubmissionDelivery(env, submissionId, 'sent');
      return jsonResponse({ ok: true }, { status: 200, headers: cors });
    } catch (e) {
      if (submissionId) await updateContactSubmissionDelivery(env, submissionId, 'failed');
      return jsonResponse(
        { ok: false, error: e instanceof Error ? e.message : 'Failed to send email.' },
        { status: 502, headers: cors }
      );
    }
  },
};
