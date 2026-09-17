function jsonHeaders() {
  return {
    'Content-Type': 'application/json',
  };
}

export function getScheduleApiBase() {
  const explicit = String(import.meta.env.VITE_SCHEDULE_API_BASE || '').trim();

  // In dev we want the API host to match the page host so the admin session
  // cookie (SameSite=Strict) is actually sent.
  // Example: page on http://localhost:* should call http://localhost:8787 (not 127.0.0.1).
  if (import.meta.env.DEV && typeof window !== 'undefined') {
    const pageHost = window.location.hostname;
    const pageProtocol = window.location.protocol;
    const defaultBase = `${pageProtocol}//${pageHost}:8787`;

    if (!explicit) return defaultBase;

    try {
      const u = new URL(explicit);
      const isLoopback = (h) => h === 'localhost' || h === '127.0.0.1';
      if (isLoopback(u.hostname) && isLoopback(pageHost) && u.hostname !== pageHost) {
        u.hostname = pageHost;
        return u.toString().replace(/\/$/, '');
      }
    } catch {
      // fall through
    }

    return explicit;
  }

  return explicit;
}

function apiUrl(path) {
  const base = getScheduleApiBase();
  if (!base) return path;
  return base.replace(/\/$/, '') + path;
}

async function postJson(path, body) {
  let res;
  try {
    res = await fetch(apiUrl(path), {
      method: 'POST',
      headers: jsonHeaders(),
      credentials: 'include',
      body: JSON.stringify(body || {}),
    });
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'Network error',
    };
  }

  let data;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  // Our Worker APIs return a JSON shape like: { ok: boolean, ... }.
  // Some deployments may still respond with HTTP 200 even when ok=false.
  // Treat those as errors so the UI can show the correct message.
  if (res.ok && data && data.ok === false) {
    return { ok: false, error: data?.error || 'Request failed' };
  }

  if (!res.ok) {
    return { ok: false, error: data?.error || `Request failed (${res.status})` };
  }

  return { ok: true, data };
}

export async function adminGetAvailability() {
  return postJson('/api/schedule/admin/availability/get', {});
}

export async function adminSetAvailability({ availability }) {
  return postJson('/api/schedule/admin/availability/set', { availability });
}

export async function adminCreateInvite({ email, days, name }) {
  return postJson('/api/schedule/admin/invite', { email, days, name });
}

export async function adminAuthStart({ email }) {
  return postJson('/api/schedule/admin/auth/start', { email });
}

export async function adminAuthVerify({ email, code }) {
  return postJson('/api/schedule/admin/auth/verify', { email, code });
}

export async function adminGetAuthConfig() {
  return postJson('/api/schedule/admin/auth/config', {});
}

export async function adminGetSession() {
  return postJson('/api/schedule/admin/auth/session', {});
}

export async function adminLogout() {
  return postJson('/api/schedule/admin/auth/logout', {});
}

export async function adminGetSubmissions({ status = 'all' } = {}) {
  return postJson('/api/schedule/admin/submissions/list', { status });
}

export async function adminUpdateSubmission({ id, status }) {
  return postJson('/api/schedule/admin/submissions/update', { id, status });
}

export async function adminGetActivity() {
  return postJson('/api/schedule/admin/activity/list', {});
}

export async function adminNewsletterGetSubscribers() {
  return postJson('/api/schedule/admin/newsletter/subscribers/get', {});
}

export async function adminNewsletterSetSubscribers({ subscribers }) {
  return postJson('/api/schedule/admin/newsletter/subscribers/set', { subscribers });
}

export async function adminNewsletterDeleteSubscribers({ subscribers }) {
  return postJson('/api/schedule/admin/newsletter/subscribers/delete', { subscribers });
}

export async function adminNewsletterGetCampaigns() {
  return postJson('/api/schedule/admin/newsletter/campaigns/list', {});
}

export async function adminNewsletterSaveCampaign({ id, subject, content, status, scheduledAt }) {
  return postJson('/api/schedule/admin/newsletter/campaigns/save', { id, subject, content, status, scheduledAt });
}

export async function adminNewsletterSend({ subject, message, content, recipients, testEmail, campaignId }) {
  return postJson('/api/schedule/admin/newsletter/send', { subject, message, content, recipients, testEmail, campaignId });
}
