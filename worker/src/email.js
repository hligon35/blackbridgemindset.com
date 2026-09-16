import { wrapBbmEmailHtml, renderBbmMessageBoxHtml } from './emailTheme';

function assertString(name, value) {
  const v = String(value || '').trim();
  if (!v) throw new Error(`${name} not configured`);
  return v;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function defaultThemedHtml({ subject, text }) {
  const cleanSubject = String(subject || '').trim();
  const cleanText = String(text || '').trim();

  const contentHtml = renderBbmMessageBoxHtml(
    `<pre style="margin:0; white-space:pre-wrap; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; color:#e0e0e0;">${escapeHtml(cleanText)}</pre>`
  );

  return wrapBbmEmailHtml({
    title: cleanSubject || 'Message',
    preheader: cleanSubject || '',
    contentHtml,
  });
}

function toArray(value) {
  return Array.isArray(value) ? value : value ? [value] : [];
}

function normalizeEmail(value) {
  return String(value || '').trim();
}

function makeMessage({ to, fromEmail, fromName, subject, text, html, replyTo }) {
  const recipients = toArray(to).map(normalizeEmail).filter(Boolean);
  if (recipients.length === 0) throw new Error('No recipients');

  const cleanSubject = assertString('subject', subject);
  const cleanText = String(text || '');
  const themedHtml = String(html || '').trim()
    ? String(html)
    : defaultThemedHtml({ subject: cleanSubject, text: cleanText });

  const cleanFromEmail = assertString('EMAIL_FROM', fromEmail);
  const cleanFromName = String(fromName || '').trim();
  const message = {
    to: recipients,
    from: cleanFromName ? `${cleanFromName} <${cleanFromEmail}>` : cleanFromEmail,
    subject: cleanSubject,
    text: cleanText,
    html: themedHtml,
  };

  const cleanReplyTo = normalizeEmail(replyTo);
  if (cleanReplyTo) message.reply_to = cleanReplyTo;

  return message;
}

function chunk(values, size) {
  const chunks = [];
  for (let i = 0; i < values.length; i += size) chunks.push(values.slice(i, i + size));
  return chunks;
}

/**
 * Send through the Resend Email API.
 *
 * Resend accepts at most 50 recipients per request, so newsletter/admin
 * broadcasts are sent in bounded batches.
 */
export async function sendEmail(env, { to, fromEmail, fromName, subject, text, html, replyTo }) {
  const message = makeMessage({ to, fromEmail, fromName, subject, text, html, replyTo });
  const recipients = message.to;
  const apiKey = assertString('RESEND_API_KEY', env.RESEND_API_KEY);

  for (const recipientBatch of chunk(recipients, 50)) {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ...message, to: recipientBatch }),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      const detail = body?.message || body?.error || `HTTP ${response.status}`;
      throw new Error(`Resend send failed (${response.status}). ${detail}`);
    }
  }

  return { ok: true };
}
