import { recordActivity } from '../../shared/submissions';

const VALID_STATUSES = new Set(['new', 'read', 'archived']);

export async function listSubmissions(env, status = 'all') {
  if (!env.SCHEDULE_DB) return { ok: false, status: 501, error: 'Submission database not configured' };

  const cleanStatus = String(status || 'all').trim().toLowerCase();
  if (cleanStatus !== 'all' && !VALID_STATUSES.has(cleanStatus)) {
    return { ok: false, status: 400, error: 'Invalid submission status' };
  }

  try {
    const result = cleanStatus === 'all'
      ? await env.SCHEDULE_DB
          .prepare(
            `SELECT id, name, email, subject, message, origin, status, deliveryStatus, createdAt, readAt, archivedAt
             FROM contact_submissions
             ORDER BY createdAt DESC
             LIMIT 500`
          )
          .all()
      : await env.SCHEDULE_DB
          .prepare(
            `SELECT id, name, email, subject, message, origin, status, deliveryStatus, createdAt, readAt, archivedAt
             FROM contact_submissions
             WHERE status = ?1
             ORDER BY createdAt DESC
             LIMIT 500`
          )
          .bind(cleanStatus)
          .all();

    return { ok: true, submissions: result.results || [] };
  } catch (error) {
    console.error('Failed to list submissions', error);
    const message = String(error?.message || '').toLowerCase();
    return {
      ok: false,
      status: message.includes('no such table') ? 501 : 500,
      error: message.includes('no such table')
        ? 'Inbox is not initialized. Apply migration-add-admin-inbox.sql to the Worker D1 database.'
        : 'Failed to load submissions',
    };
  }
}

export async function updateSubmissionStatus(env, { id, status, actorEmail }) {
  if (!env.SCHEDULE_DB) return { ok: false, status: 501, error: 'Submission database not configured' };

  const cleanId = String(id || '').trim();
  const cleanStatus = String(status || '').trim().toLowerCase();
  if (!cleanId) return { ok: false, status: 400, error: 'Submission ID is required' };
  if (!VALID_STATUSES.has(cleanStatus)) return { ok: false, status: 400, error: 'Invalid submission status' };

  const now = Date.now();
  try {
    const result = await env.SCHEDULE_DB
      .prepare(
        `UPDATE contact_submissions
         SET status = ?1,
             readAt = CASE WHEN ?1 IN ('read', 'archived') THEN COALESCE(readAt, ?2) ELSE NULL END,
             archivedAt = CASE WHEN ?1 = 'archived' THEN COALESCE(archivedAt, ?2) ELSE NULL END
         WHERE id = ?3`
      )
      .bind(cleanStatus, now, cleanId)
      .run();

    if (!result.meta || result.meta.changes === 0) {
      return { ok: false, status: 404, error: 'Submission not found' };
    }

    await recordActivity(env, {
      action: `submission.${cleanStatus}`,
      entityType: 'submission',
      entityId: cleanId,
      actorEmail,
      detail: { status: cleanStatus },
    });

    return { ok: true };
  } catch (error) {
    console.error('Failed to update submission', error);
    const message = String(error?.message || '').toLowerCase();
    return {
      ok: false,
      status: message.includes('no such table') ? 501 : 500,
      error: message.includes('no such table')
        ? 'Inbox is not initialized. Apply migration-add-admin-inbox.sql to the Worker D1 database.'
        : 'Failed to update submission',
    };
  }
}

export async function listActivity(env) {
  if (!env.SCHEDULE_DB) return { ok: false, status: 501, error: 'Activity database not configured' };

  try {
    const result = await env.SCHEDULE_DB
      .prepare(
        `SELECT id, action, entityType, entityId, actorEmail, detail, createdAt
         FROM activity_log
         ORDER BY createdAt DESC
         LIMIT 500`
      )
      .all();
    return { ok: true, activity: result.results || [] };
  } catch (error) {
    console.error('Failed to list activity', error);
    const message = String(error?.message || '').toLowerCase();
    return {
      ok: false,
      status: message.includes('no such table') ? 501 : 500,
      error: message.includes('no such table')
        ? 'Activity log is not initialized. Apply migration-add-admin-inbox.sql to the Worker D1 database.'
        : 'Failed to load activity',
    };
  }
}
