function newId(prefix) {
  return `${prefix}_${crypto.randomUUID()}`;
}

function safeJson(value) {
  try {
    return JSON.stringify(value || {});
  } catch {
    return '{}';
  }
}

export async function createContactSubmission(env, submission) {
  if (!env.SCHEDULE_DB) return null;

  const id = newId('sub');
  try {
    await env.SCHEDULE_DB
      .prepare(
        `INSERT INTO contact_submissions
          (id, name, email, subject, message, origin, ip, userAgent, status, deliveryStatus, createdAt)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'new', 'pending', ?9)`
      )
      .bind(
        id,
        String(submission.name || ''),
        String(submission.email || ''),
        String(submission.subject || ''),
        String(submission.message || ''),
        String(submission.origin || ''),
        String(submission.ip || ''),
        String(submission.userAgent || ''),
        Number(submission.createdAt) || Date.now()
      )
      .run();
    return id;
  } catch (error) {
    console.warn('contact submission storage unavailable', error);
    return null;
  }
}

export async function updateContactSubmissionDelivery(env, id, deliveryStatus) {
  if (!env.SCHEDULE_DB || !id) return false;
  try {
    await env.SCHEDULE_DB
      .prepare('UPDATE contact_submissions SET deliveryStatus = ?1 WHERE id = ?2')
      .bind(String(deliveryStatus || 'failed'), id)
      .run();
    return true;
  } catch (error) {
    console.warn('contact submission delivery status update failed', error);
    return false;
  }
}

export async function recordActivity(env, { action, entityType = 'system', entityId = '', actorEmail = '', detail = {} }) {
  if (!env.SCHEDULE_DB) return false;
  try {
    await env.SCHEDULE_DB
      .prepare(
        `INSERT INTO activity_log
          (id, action, entityType, entityId, actorEmail, detail, createdAt)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`
      )
      .bind(
        newId('activity'),
        String(action || 'unknown'),
        String(entityType || 'system'),
        String(entityId || ''),
        String(actorEmail || ''),
        safeJson(detail),
        Date.now()
      )
      .run();
    return true;
  } catch (error) {
    console.warn('activity log unavailable', error);
    return false;
  }
}
