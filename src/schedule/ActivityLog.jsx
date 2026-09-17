import React, { useEffect, useState } from 'react';

import { adminGetActivity } from './utils/adminApi';
import { useAdminToast } from './components/AdminToast';

function formatDate(value) {
  const date = new Date(Number(value));
  if (Number.isNaN(date.getTime())) return 'Unknown date';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function humanizeAction(action) {
  return String(action || 'activity')
    .replaceAll('.', ' · ')
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function detailText(value) {
  if (!value) return '';
  try {
    const parsed = JSON.parse(value);
    return Object.entries(parsed)
      .map(([key, item]) => `${key}: ${String(item)}`)
      .join(' · ');
  } catch {
    return String(value);
  }
}

export default function ActivityLog() {
  const [activity, setActivity] = useState([]);
  const [state, setState] = useState({ status: 'loading', error: '' });
  const { notify } = useAdminToast();

  async function load({ announce = false } = {}) {
    setState({ status: 'loading', error: '' });
    const result = await adminGetActivity();
    if (!result.ok) {
      setState({ status: 'error', error: result.error || 'Unable to load activity.' });
      notify({ tone: 'error', message: result.error || 'Unable to load activity.' });
      return;
    }
    setActivity(Array.isArray(result.data?.activity) ? result.data.activity : []);
    setState({ status: 'ready', error: '' });
    if (announce) notify({ message: 'Activity log refreshed.' });
  }

  useEffect(() => {
    load();
    // The initial load intentionally runs once when the panel mounts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section className="admin-panel" aria-labelledby="activity-heading">
      <div className="admin-panel-heading">
        <div>
          <p className="admin-eyebrow">History</p>
          <h1 id="activity-heading">Activity log</h1>
          <p>A timeline of inbox actions and admin activity.</p>
        </div>
        <button className="admin-secondary-button" type="button" onClick={() => load({ announce: true })} disabled={state.status === 'loading'}>
          {state.status === 'loading' ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {state.status === 'ready' && activity.length === 0 ? (
        <div className="admin-empty-state">
          <strong>No activity recorded yet.</strong>
          <span>New submissions and inbox actions will appear here.</span>
        </div>
      ) : null}

      {activity.length > 0 ? (
        <div className="admin-activity-list">
          {activity.map((item) => (
            <div className="admin-activity-item" key={item.id}>
              <span className="admin-activity-dot" aria-hidden="true" />
              <div className="admin-activity-content">
                <div className="admin-activity-topline">
                  <strong>{humanizeAction(item.action)}</strong>
                  <time dateTime={new Date(Number(item.createdAt)).toISOString()}>{formatDate(item.createdAt)}</time>
                </div>
                <span className="admin-activity-entity">{item.entityType}{item.entityId ? ` · ${item.entityId}` : ''}</span>
                {item.actorEmail ? <span className="admin-activity-actor">Admin: {item.actorEmail}</span> : null}
                {detailText(item.detail) ? <span className="admin-activity-detail">{detailText(item.detail)}</span> : null}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
