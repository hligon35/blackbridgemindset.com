import React, { useEffect, useMemo, useState } from 'react';

import { adminGetSubmissions, adminUpdateSubmission } from './utils/adminApi';

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'new', label: 'New' },
  { id: 'read', label: 'Read' },
  { id: 'archived', label: 'Archived' },
];

function formatDate(value) {
  const date = new Date(Number(value));
  if (Number.isNaN(date.getTime())) return 'Unknown date';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function getPreview(message) {
  const clean = String(message || '').replace(/\s+/g, ' ').trim();
  return clean.length > 110 ? `${clean.slice(0, 110)}…` : clean;
}

export default function SubmissionsInbox() {
  const [filter, setFilter] = useState('all');
  const [submissions, setSubmissions] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [state, setState] = useState({ status: 'loading', error: '' });
  const [updatingId, setUpdatingId] = useState(null);

  async function load(nextFilter = filter) {
    setState({ status: 'loading', error: '' });
    const result = await adminGetSubmissions({ status: nextFilter });
    if (!result.ok) {
      setState({ status: 'error', error: result.error || 'Unable to load submissions.' });
      return;
    }

    const next = Array.isArray(result.data?.submissions) ? result.data.submissions : [];
    setSubmissions(next);
    setSelectedId((current) => (next.some((item) => item.id === current) ? current : next[0]?.id || null));
    setState({ status: 'ready', error: '' });
  }

  useEffect(() => {
    load(filter);
    // The filter is intentionally the only reload trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  const selected = useMemo(
    () => submissions.find((item) => item.id === selectedId) || null,
    [selectedId, submissions]
  );

  async function updateStatus(id, status) {
    setUpdatingId(id);
    const result = await adminUpdateSubmission({ id, status });
    setUpdatingId(null);
    if (!result.ok) {
      setState({ status: 'error', error: result.error || 'Unable to update submission.' });
      return;
    }
    await load(filter);
  }

  return (
    <section className="admin-panel" aria-labelledby="submissions-heading">
      <div className="admin-panel-heading">
        <div>
          <p className="admin-eyebrow">Inbox</p>
          <h1 id="submissions-heading">Submissions</h1>
          <p>Review messages sent through the website contact form.</p>
        </div>
        <button className="admin-secondary-button" type="button" onClick={() => load(filter)} disabled={state.status === 'loading'}>
          {state.status === 'loading' ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      <div className="admin-filter-row" role="tablist" aria-label="Submission filters">
        {FILTERS.map((item) => (
          <button
            key={item.id}
            className={`admin-filter-button${filter === item.id ? ' is-active' : ''}`}
            type="button"
            role="tab"
            aria-selected={filter === item.id}
            onClick={() => setFilter(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {state.status === 'error' ? <div className="admin-alert admin-alert-error">{state.error}</div> : null}

      {state.status === 'ready' && submissions.length === 0 ? (
        <div className="admin-empty-state">
          <strong>No submissions here yet.</strong>
          <span>New contact messages will appear in this inbox.</span>
        </div>
      ) : null}

      {submissions.length > 0 ? (
        <div className="admin-inbox-layout">
          <div className="admin-submission-list" role="list" aria-label="Contact submissions">
            {submissions.map((item) => (
              <button
                key={item.id}
                className={`admin-submission-item${item.id === selectedId ? ' is-selected' : ''}${item.status === 'new' ? ' is-new' : ''}`}
                type="button"
                onClick={() => setSelectedId(item.id)}
                role="listitem"
              >
                <span className="admin-submission-item-topline">
                  <strong>{item.name || 'Unnamed visitor'}</strong>
                  <time dateTime={new Date(Number(item.createdAt)).toISOString()}>{formatDate(item.createdAt)}</time>
                </span>
                <span className="admin-submission-subject">{item.subject || 'New contact form submission'}</span>
                <span className="admin-submission-preview">{getPreview(item.message)}</span>
                <span className="admin-submission-meta">
                  <span className={`admin-status-badge status-${item.status}`}>{item.status}</span>
                  {item.deliveryStatus === 'failed' ? <span className="admin-delivery-failed">Email delivery failed</span> : null}
                </span>
              </button>
            ))}
          </div>

          {selected ? (
            <article className="admin-submission-detail">
              <div className="admin-detail-header">
                <div>
                  <p className="admin-eyebrow">Contact message</p>
                  <h2>{selected.subject || 'New contact form submission'}</h2>
                  <p className="admin-detail-date">{formatDate(selected.createdAt)}</p>
                </div>
                <span className={`admin-status-badge status-${selected.status}`}>{selected.status}</span>
              </div>

              <div className="admin-contact-card">
                <strong>{selected.name || 'Unnamed visitor'}</strong>
                <a href={`mailto:${selected.email}`}>{selected.email}</a>
              </div>

              <div className="admin-message-body">{selected.message}</div>

              <div className="admin-detail-actions">
                {selected.status === 'new' ? (
                  <button className="admin-primary-button" type="button" onClick={() => updateStatus(selected.id, 'read')} disabled={updatingId === selected.id}>
                    Mark as read
                  </button>
                ) : null}
                {selected.status !== 'archived' ? (
                  <button className="admin-secondary-button" type="button" onClick={() => updateStatus(selected.id, 'archived')} disabled={updatingId === selected.id}>
                    Archive
                  </button>
                ) : (
                  <button className="admin-secondary-button" type="button" onClick={() => updateStatus(selected.id, 'read')} disabled={updatingId === selected.id}>
                    Move to read
                  </button>
                )}
              </div>

              {selected.deliveryStatus === 'failed' ? (
                <div className="admin-alert admin-alert-warning">The message was saved, but email delivery failed. Reply from this inbox after checking the Resend configuration.</div>
              ) : null}
            </article>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
