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

  const message = {
    to: recipients,
    from: {
      email: assertString('EMAIL_FROM', fromEmail),
      name: String(fromName || '').trim() || undefined,
    },
    subject: cleanSubject,
    text: cleanText,
    html: themedHtml,
  };

  const cleanReplyTo = normalizeEmail(replyTo);
  if (cleanReplyTo) message.replyTo = cleanReplyTo;

  return message;
}

function chunk(values, size) {
  const chunks = [];
  for (let i = 0; i < values.length; i += size) chunks.push(values.slice(i, i + size));
  return chunks;
}

/**
 * Send through Cloudflare Email Service.
 *
 * The binding accepts at most 50 combined recipients per message, so
 * newsletter/admin broadcasts are sent in bounded batches.
 */
export async function sendEmail(env, { to, fromEmail, fromName, subject, text, html, replyTo }) {
  if (!env.EMAIL || typeof env.EMAIL.send !== 'function') {
    throw new Error('Cloudflare Email Service binding EMAIL not configured');
  }

  const message = makeMessage({ to, fromEmail, fromName, subject, text, html, replyTo });
  const recipients = message.to;

  for (const recipientBatch of chunk(recipients, 50)) {
    await env.EMAIL.send({ ...message, to: recipientBatch });
  }

  return { ok: true };
}
