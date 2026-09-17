import { sendEmail } from '../../email';
import { wrapBbmEmailHtml, renderBbmButtonHtml, renderBbmMessageBoxHtml } from '../../emailTheme';
import { escapeHtml } from '../../shared/sanitize';
import { recordActivity } from '../../shared/submissions';

const MAX_SECTIONS = 6;

export const DEFAULT_NEWSLETTER_CONTENT = Object.freeze({
  preheader: 'Stories, conversations, and mindset shifts from Black Bridge Mindset.',
  intro:
    'Welcome to the bridge. Here is a quick update from Black Bridge Mindset—new conversations, practical perspective, and the ideas that keep us moving forward.',
  sections: [
    {
      title: 'From the podcast',
      body: 'Share the latest conversation, guest insight, or episode you want the community to hear next.',
    },
    {
      title: 'Mindset moment',
      body: 'A short reflection, challenge, or lesson your readers can carry into the week.',
    },
  ],
  ctaLabel: 'Listen to Black Bridge Mindset',
  ctaUrl: 'https://blackbridgemindset.buzzsprout.com/',
  closing: 'Keep building. Keep crossing.\n\n— Mike, Host of Black Bridge Mindset',
});

function cleanText(value, maxLength, fallback = '') {
  const text = String(value ?? '').trim();
  if (!text) return fallback;
  return text.slice(0, maxLength);
}

function cleanUrl(value, fallback = '') {
  const raw = String(value || '').trim();
  if (!raw) return fallback;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return fallback;
    return url.toString().slice(0, 500);
  } catch {
    return fallback;
  }
}

export function normalizeNewsletterContent(input = {}) {
  const raw = input && typeof input === 'object' ? input : {};
  const defaultSections = Array.isArray(DEFAULT_NEWSLETTER_CONTENT.sections) ? DEFAULT_NEWSLETTER_CONTENT.sections : [];
  const rawSections = Array.isArray(raw.sections) ? raw.sections : defaultSections;
  const sections = rawSections
    .slice(0, MAX_SECTIONS)
    .map((section) => ({
      title: cleanText(section?.title, 100),
      body: cleanText(section?.body, 3000),
    }))
    .filter((section) => section.title || section.body);

  return {
    preheader: cleanText(raw.preheader, 180, DEFAULT_NEWSLETTER_CONTENT.preheader),
    intro: cleanText(raw.intro, 3000, DEFAULT_NEWSLETTER_CONTENT.intro),
    sections,
    ctaLabel: cleanText(raw.ctaLabel, 80),
    ctaUrl: cleanUrl(raw.ctaUrl),
    closing: cleanText(raw.closing, 1000, DEFAULT_NEWSLETTER_CONTENT.closing),
  };
}

function renderSectionHtml(section) {
  return `
    <div style="margin:14px 0 0 0; padding:16px 18px; border:1px solid #465360; border-left:3px solid #f7c873; border-radius:12px; background:#1c2731;">
      ${section.title ? `<h3 style="margin:0 0 7px 0; color:#f7c873; font-family:Georgia, 'Times New Roman', serif; font-size:17px; line-height:1.25;">${escapeHtml(section.title)}</h3>` : ''}
      ${section.body ? `<p style="margin:0; color:#e0e4e8; white-space:pre-wrap;">${escapeHtml(section.body)}</p>` : ''}
    </div>
  `;
}

export function buildNewsletterEmail({ subject, content, message = '' }) {
  const cleanSubject = cleanText(subject, 150, 'Black Bridge Mindset update');
  const normalized = normalizeNewsletterContent(
    content && typeof content === 'object' ? content : { intro: message || DEFAULT_NEWSLETTER_CONTENT.intro }
  );
  const sectionsText = normalized.sections
    .map((section) => [section.title, section.body].filter(Boolean).join('\n'))
    .filter(Boolean)
    .join('\n\n');
  const text = [normalized.intro, sectionsText, normalized.ctaLabel && normalized.ctaUrl ? `${normalized.ctaLabel}: ${normalized.ctaUrl}` : '', normalized.closing]
    .filter(Boolean)
    .join('\n\n');

  const contentHtml = `
    ${renderBbmMessageBoxHtml(`<p style="margin:0; color:#e5edf5; white-space:pre-wrap;">${escapeHtml(normalized.intro)}</p>`)}
    ${normalized.sections.map(renderSectionHtml).join('')}
    ${normalized.ctaLabel && normalized.ctaUrl ? `<div style="margin:22px 0 0 0;">${renderBbmButtonHtml({ hrefEscaped: escapeHtml(normalized.ctaUrl), labelEscaped: escapeHtml(normalized.ctaLabel) })}</div>` : ''}
    <p style="margin:22px 0 0 0; color:#d5dbe0; white-space:pre-wrap;">${escapeHtml(normalized.closing)}</p>
  `;

  const html = wrapBbmEmailHtml({
    title: cleanSubject,
    preheader: normalized.preheader,
    contentHtml,
  });

  return { subject: cleanSubject, text, html, content: normalized };
}

function newCampaignId() {
  return `campaign_${crypto.randomUUID()}`;
}

function campaignRow(row) {
  let content = {};
  try {
    content = JSON.parse(String(row?.content || '{}'));
  } catch {
    content = {};
  }

  return {
    id: String(row?.id || ''),
    status: String(row?.status || 'draft'),
    subject: String(row?.subject || ''),
    content: normalizeNewsletterContent(content),
    scheduledAt: Number(row?.scheduledAt) || null,
    sentAt: Number(row?.sentAt) || null,
    recipientCount: Number(row?.recipientCount) || 0,
    createdBy: String(row?.createdBy || ''),
    createdAt: Number(row?.createdAt) || 0,
    updatedAt: Number(row?.updatedAt) || 0,
    errorMessage: String(row?.errorMessage || ''),
  };
}

export async function listNewsletterCampaigns(env) {
  if (!env.SCHEDULE_DB) return { ok: false, status: 501, error: 'Newsletter database not configured' };
  try {
    const result = await env.SCHEDULE_DB
      .prepare(
        `SELECT id, status, subject, content, scheduledAt, sentAt, recipientCount, createdBy, createdAt, updatedAt, errorMessage
         FROM newsletter_campaigns
         ORDER BY updatedAt DESC
         LIMIT 100`
      )
      .all();
    return { ok: true, status: 200, campaigns: (result.results || []).map(campaignRow) };
  } catch (error) {
    console.error('Failed to list newsletter campaigns', error);
    const message = String(error?.message || '').toLowerCase();
    return {
      ok: false,
      status: message.includes('no such table') ? 501 : 500,
      error: message.includes('no such table')
        ? 'Newsletter campaigns are not initialized. Apply the latest D1 migration.'
        : 'Failed to load newsletter campaigns',
    };
  }
}

export async function saveNewsletterCampaign(env, { id, subject, content, status = 'draft', scheduledAt = null, actorEmail = '' }) {
  if (!env.SCHEDULE_DB) return { ok: false, status: 501, error: 'Newsletter database not configured' };

  const cleanStatus = status === 'scheduled' ? 'scheduled' : 'draft';
  const cleanSubject = cleanText(subject, 150);
  if (!cleanSubject) return { ok: false, status: 400, error: 'Subject is required' };
  const normalizedContent = normalizeNewsletterContent(content);
  const now = Date.now();
  const scheduleTime = cleanStatus === 'scheduled' ? Number(scheduledAt) : null;

  if (cleanStatus === 'scheduled' && (!Number.isFinite(scheduleTime) || scheduleTime <= now)) {
    return { ok: false, status: 400, error: 'Choose a future date and time for the newsletter.' };
  }

  const campaignId = String(id || '').trim() || newCampaignId();
  try {
    await env.SCHEDULE_DB
      .prepare(
        `INSERT INTO newsletter_campaigns
          (id, status, subject, content, scheduledAt, sentAt, recipientCount, createdBy, createdAt, updatedAt, errorMessage)
         VALUES (?1, ?2, ?3, ?4, ?5, NULL, 0, ?6, ?7, ?7, NULL)
         ON CONFLICT(id) DO UPDATE SET
           status = excluded.status,
           subject = excluded.subject,
           content = excluded.content,
           scheduledAt = excluded.scheduledAt,
           updatedAt = excluded.updatedAt,
           errorMessage = NULL`
      )
      .bind(campaignId, cleanStatus, cleanSubject, JSON.stringify(normalizedContent), scheduleTime, String(actorEmail || ''), now)
      .run();

    await recordActivity(env, {
      action: cleanStatus === 'scheduled' ? 'newsletter.scheduled' : 'newsletter.draft.saved',
      entityType: 'newsletter',
      entityId: campaignId,
      actorEmail,
      detail: { subject: cleanSubject, scheduledAt: scheduleTime },
    });

    return { ok: true, status: 200, campaign: campaignRow({ id: campaignId, status: cleanStatus, subject: cleanSubject, content: JSON.stringify(normalizedContent), scheduledAt: scheduleTime, createdBy: actorEmail, createdAt: now, updatedAt: now }) };
  } catch (error) {
    console.error('Failed to save newsletter campaign', error);
    const message = String(error?.message || '').toLowerCase();
    return {
      ok: false,
      status: message.includes('no such table') ? 501 : 500,
      error: message.includes('no such table') ? 'Newsletter campaigns are not initialized. Apply the latest D1 migration.' : 'Failed to save newsletter',
    };
  }
}

export async function deleteNewsletterCampaign(env, { id, actorEmail = '' }) {
  if (!env.SCHEDULE_DB) return { ok: false, status: 501, error: 'Newsletter database not configured' };
  const campaignId = String(id || '').trim();
  if (!campaignId) return { ok: false, status: 400, error: 'Newsletter ID is required' };

  try {
    const result = await env.SCHEDULE_DB.prepare('DELETE FROM newsletter_campaigns WHERE id = ?1').bind(campaignId).run();
    if (!result.meta || result.meta.changes === 0) return { ok: false, status: 404, error: 'Newsletter not found' };
    await recordActivity(env, {
      action: 'newsletter.deleted',
      entityType: 'newsletter',
      entityId: campaignId,
      actorEmail,
    });
    return { ok: true, status: 200 };
  } catch (error) {
    console.error('Failed to delete newsletter campaign', error);
    return { ok: false, status: 500, error: 'Failed to delete newsletter' };
  }
}

async function getStoredSubscribers(env) {
  if (!env.SCHEDULE_CONFIG) return [];
  try {
    const value = await env.SCHEDULE_CONFIG.get('newsletter:subscribers', { type: 'json' });
    return Array.isArray(value) ? value.map((email) => String(email || '').trim().toLowerCase()).filter((email) => email.includes('@')) : [];
  } catch {
    return [];
  }
}

async function sendCampaignRow(env, row, recipients, actorEmail = '') {
  const campaign = campaignRow(row);
  const email = buildNewsletterEmail({ subject: campaign.subject, content: campaign.content });
  await sendEmail(env, {
    to: recipients,
    fromEmail: env.EMAIL_FROM,
    fromName: env.FROM_NAME || 'Black Bridge Mindset',
    subject: email.subject,
    text: email.text,
    html: email.html,
  });

  await env.SCHEDULE_DB
    .prepare('UPDATE newsletter_campaigns SET status = \'sent\', sentAt = ?1, recipientCount = ?2, updatedAt = ?1, errorMessage = NULL WHERE id = ?3')
    .bind(Date.now(), recipients.length, campaign.id)
    .run();

  await recordActivity(env, {
    action: campaign.status === 'scheduled' ? 'newsletter.sent.scheduled' : 'newsletter.sent',
    entityType: 'newsletter',
    entityId: campaign.id,
    actorEmail: actorEmail || campaign.createdBy,
    detail: { subject: campaign.subject, recipients: recipients.length },
  });
}

export async function processScheduledNewsletters(env) {
  if (!env.SCHEDULE_DB || !env.EMAIL_FROM) return { ok: false, sent: 0, error: 'Newsletter delivery is not configured' };

  const now = Date.now();
  let rows;
  try {
    const result = await env.SCHEDULE_DB
      .prepare(
        `SELECT id, status, subject, content, scheduledAt, sentAt, recipientCount, createdBy, createdAt, updatedAt, errorMessage
         FROM newsletter_campaigns
         WHERE status = 'scheduled' AND scheduledAt IS NOT NULL AND scheduledAt <= ?1
         ORDER BY scheduledAt ASC
         LIMIT 10`
      )
      .bind(now)
      .all();
    rows = result.results || [];
  } catch (error) {
    console.warn('Scheduled newsletter scan unavailable', error);
    return { ok: false, sent: 0, error: 'Scheduled newsletter table is not initialized' };
  }

  const recipients = await getStoredSubscribers(env);
  let sent = 0;
  for (const row of rows) {
    const claimed = await env.SCHEDULE_DB
      .prepare("UPDATE newsletter_campaigns SET status = 'sending', updatedAt = ?1 WHERE id = ?2 AND status = 'scheduled'")
      .bind(Date.now(), String(row.id || ''))
      .run();
    if (!claimed.meta || claimed.meta.changes === 0) continue;

    try {
      if (recipients.length === 0) throw new Error('No newsletter subscribers');
      await sendCampaignRow(env, row, recipients);
      sent += 1;
    } catch (error) {
      await env.SCHEDULE_DB
        .prepare("UPDATE newsletter_campaigns SET status = 'failed', updatedAt = ?1, errorMessage = ?2 WHERE id = ?3")
        .bind(Date.now(), String(error?.message || 'Failed to send newsletter').slice(0, 500), String(row.id || ''))
        .run();
      await recordActivity(env, {
        action: 'newsletter.send.failed',
        entityType: 'newsletter',
        entityId: String(row.id || ''),
        actorEmail: String(row.createdBy || ''),
        detail: { error: String(error?.message || 'Failed to send newsletter') },
      });
    }
  }

  return { ok: true, sent };
}
