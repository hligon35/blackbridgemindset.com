import React, { useEffect, useMemo, useState } from 'react';

import {
  adminNewsletterGetSubscribers,
  adminNewsletterSend,
  adminNewsletterSetSubscribers,
  getScheduleApiBase,
} from '../utils/adminApi';

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function parseEmailList(text) {
  const raw = String(text || '')
    .split(/\r?\n|,/g)
    .map((s) => normalizeEmail(s))
    .filter(Boolean);

  const seen = new Set();
  const out = [];
  for (const e of raw) {
    if (seen.has(e)) continue;
    seen.add(e);
    out.push(e);
  }

  return out;
}

export default function MailBlastPanel({ sessionEmail }) {
  const apiBase = useMemo(() => getScheduleApiBase(), []);

  const [subscribers, setSubscribers] = useState([]);
  const [labels, setLabels] = useState(() => ({}));
  const [selected, setSelected] = useState(() => new Set());
  const [addEmail, setAddEmail] = useState('');
  const [subscribersState, setSubscribersState] = useState({ status: 'idle', error: '', info: '' });

  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');

  const [testEmail, setTestEmail] = useState(sessionEmail || '');

  const [sendState, setSendState] = useState({ status: 'idle', error: '', info: '' });
  const [progress, setProgress] = useState({ sent: 0, total: 0 });

  function handleAddSubscriber() {
    const list = parseEmailList(addEmail);
    if (list.length === 0) {
      setSubscribersState({ status: 'error', error: 'Enter a valid email address to add.', info: '' });
      return;
    }

    setSubscribers((prev) => {
      const seen = new Set(prev);
      const merged = [...prev];
      for (const e of list) {
        if (seen.has(e)) continue;
        seen.add(e);
        merged.push(e);
      }

      setLabels((prevLabels) => {
        const next = { ...(prevLabels || {}) };
        for (const e of list) {
          if (!next[e]) next[e] = 'subscriber';
        }
        return next;
      });

      setSelected(new Set(merged));
      return merged;
    });

    setAddEmail('');
    setSubscribersState({ status: 'ready', error: '', info: 'Added. Click “Save list” to persist.' });
  }

  function handleSelectAll() {
    setSelected(new Set(subscribers));
  }

  function handleSelectNone() {
    setSelected(new Set());
  }

  useEffect(() => {
    // Best-effort: preload saved subscriber list.
    let cancelled = false;

    async function load() {
      setSubscribersState({ status: 'loading', error: '', info: '' });
      const res = await adminNewsletterGetSubscribers();
      if (cancelled) return;

      if (!res.ok) {
        setSubscribersState({ status: 'error', error: res.error || 'Failed to load subscribers', info: '' });
        return;
      }

      const list = Array.isArray(res.data?.subscribers) ? res.data.subscribers : [];
      const labelMap = res.data?.labels && typeof res.data.labels === 'object' ? res.data.labels : {};
      setSubscribers(list);
      setLabels(labelMap);
      setSelected(new Set(list));
      setSubscribersState({ status: 'ready', error: '', info: list.length ? `Loaded ${list.length} subscribers.` : 'No subscribers saved yet.' });
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSaveSubscribers(e) {
    e.preventDefault();
    setSubscribersState({ status: 'loading', error: '', info: '' });

    if (subscribers.length === 0) {
      setSubscribersState({ status: 'error', error: 'Please add at least one subscriber email.', info: '' });
      return;
    }

    const res = await adminNewsletterSetSubscribers({ subscribers });
    if (!res.ok) {
      setSubscribersState({ status: 'error', error: res.error || 'Failed to save subscribers', info: '' });
      return;
    }

    const saved = Array.isArray(res.data?.subscribers) ? res.data.subscribers : subscribers;
    const labelMap = res.data?.labels && typeof res.data.labels === 'object' ? res.data.labels : labels;
    setSubscribers(saved);
    setLabels(labelMap);
    setSelected(new Set(saved));
    setSubscribersState({ status: 'ready', error: '', info: `Saved ${saved.length} subscribers.` });
  }

  async function handleSendTest(e) {
    e.preventDefault();
    setSendState({ status: 'loading', error: '', info: '' });

    const cleanTest = normalizeEmail(testEmail);
    if (!cleanTest || !cleanTest.includes('@')) {
      setSendState({ status: 'error', error: 'Enter a valid test email.', info: '' });
      return;
    }

    const cleanSubject = String(subject || '').trim();
    const cleanMessage = String(message || '').trim();

    if (!cleanSubject) {
      setSendState({ status: 'error', error: 'Subject is required.', info: '' });
      return;
    }

    if (!cleanMessage) {
      setSendState({ status: 'error', error: 'Message is required.', info: '' });
      return;
    }

    const res = await adminNewsletterSend({ subject: cleanSubject, message: cleanMessage, testEmail: cleanTest });
    if (!res.ok) {
      setSendState({ status: 'error', error: res.error || 'Failed to send test email', info: '' });
      return;
    }

    setSendState({ status: 'ready', error: '', info: `Test email sent to ${cleanTest}.` });
  }

  async function handleSendCampaign(e) {
    e.preventDefault();
    setSendState({ status: 'loading', error: '', info: '' });

    const list = subscribers;
    if (list.length === 0) {
      setSendState({ status: 'error', error: 'No subscribers. Add emails and Save list first.', info: '' });
      return;
    }

    const recipients = list.filter((e) => selected.has(e));
    if (recipients.length === 0) {
      setSendState({ status: 'error', error: 'No recipients selected.', info: '' });
      return;
    }

    const cleanSubject = String(subject || '').trim();
    const cleanMessage = String(message || '').trim();

    if (!cleanSubject) {
      setSendState({ status: 'error', error: 'Subject is required.', info: '' });
      return;
    }

    if (!cleanMessage) {
      setSendState({ status: 'error', error: 'Message is required.', info: '' });
      return;
    }

    // Send in small batches so one click remains reliable.
    const batchSize = 50;
    setProgress({ sent: 0, total: recipients.length });

    for (let i = 0; i < recipients.length; i += batchSize) {
      const batch = recipients.slice(i, i + batchSize);
      const res = await adminNewsletterSend({ subject: cleanSubject, message: cleanMessage, recipients: batch });
      if (!res.ok) {
        setSendState({ status: 'error', error: res.error || 'Failed while sending', info: '' });
        return;
      }

      setProgress((p) => ({ sent: Math.min(recipients.length, p.sent + batch.length), total: p.total }));
    }

    setSendState({ status: 'ready', error: '', info: `Sent to ${recipients.length} recipients.` });
  }

  return (
    <div>
      <h3 className="bbm-contact-subtitle" style={{ textAlign: 'center' }}>
        Mail Blast
      </h3>

      <p className="bbm-contact-text" style={{ textAlign: 'center', opacity: 0.9, fontSize: 14 }}>
        {/* This sends your message to saved subscribers via the same API host as scheduling. */}
        {apiBase ? (
          <>
            {' '}
            <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace' }}>{apiBase}</span>
          </>
        ) : null}
      </p>

      <form onSubmit={handleSaveSubscribers} className="bbm-contact-form" style={{ marginTop: 10 }}>
        <div
          data-bbm-tour="mail-subscribers-manage"
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <h4 className="bbm-contact-subtitle" style={{ marginBottom: 0, fontSize: '1.1rem' }}>
              Subscribers
            </h4>

            <div style={{ display: 'inline-flex', gap: 10, alignItems: 'center' }}>
              <button
                className="bbm-form-submit"
                type="button"
                onClick={handleSelectAll}
                style={{ marginTop: 0, width: 'fit-content' }}
                disabled={subscribersState.status === 'loading' || subscribers.length === 0}
              >
                Select all
              </button>
              <button
                className="bbm-form-submit"
                type="button"
                onClick={handleSelectNone}
                style={{ marginTop: 0, width: 'fit-content' }}
                disabled={subscribersState.status === 'loading' || subscribers.length === 0}
              >
                Select none
              </button>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, alignItems: 'end' }}>
            <label className="bbm-form-label" style={{ margin: 0 }}>
              Add address
              <input
                className="bbm-form-input"
                value={addEmail}
                onChange={(e) => setAddEmail(e.target.value)}
                placeholder="person@example.com"
                disabled={subscribersState.status === 'loading'}
              />
            </label>

            <button
              className="bbm-form-submit"
              type="button"
              onClick={handleAddSubscriber}
              style={{ marginTop: 0, width: 'fit-content', alignSelf: 'end' }}
              disabled={subscribersState.status === 'loading'}
            >
              Add
            </button>
          </div>

          <div
            style={{
              marginTop: 10,
              border: '1px solid rgba(247, 200, 115, 0.22)',
              borderRadius: 10,
              padding: 10,
              maxHeight: 240,
              overflow: 'auto',
            }}
          >
            {subscribers.length === 0 ? (
              <div style={{ opacity: 0.85, fontSize: 14 }}>No subscribers yet.</div>
            ) : (
              subscribers.map((email) => (
                <label
                  key={email}
                  className="bbm-form-label"
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 10,
                    margin: 0,
                    padding: '6px 4px',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={selected.has(email)}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setSelected((prev) => {
                        const next = new Set(prev);
                        if (checked) next.add(email);
                        else next.delete(email);
                        return next;
                      });
                    }}
                  />
                  <span
                    style={{
                      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                      fontSize: 13,
                      flex: 1,
                      minWidth: 0,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {email}
                  </span>
                  <span style={{ fontSize: 12, opacity: 0.7, textTransform: 'lowercase' }}>
                    {String(labels?.[email] || 'subscriber')}
                  </span>
                </label>
              ))
            )}
          </div>
        </div>

        {subscribersState.error ? <div className="bbm-form-error">{subscribersState.error}</div> : null}
        {subscribersState.info ? <div className="bbm-form-success">{subscribersState.info}</div> : null}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <button className="bbm-form-submit" type="submit" disabled={subscribersState.status === 'loading'} style={{ marginTop: 0 }}>
            {subscribersState.status === 'loading' ? 'Saving…' : 'Save list'}
          </button>
          <button
            className="bbm-form-submit"
            type="button"
            onClick={() => {
              const confirmed = window.confirm(
                'Clear the subscriber list from this screen?\n\nThis only clears what you\'re currently viewing/edits you\'ve made here. It does not change the saved list until you click “Save list”.'
              );
              if (!confirmed) return;
              setSubscribers([]);
              setSelected(new Set());
              setAddEmail('');
              setSubscribersState({ status: 'idle', error: '', info: '' });
            }}
            style={{ marginTop: 0 }}
          >
            Clear
          </button>
        </div>
      </form>

      <hr style={{ margin: '24px 0', border: 'none', borderTop: '1px solid rgba(247, 200, 115, 0.22)' }} />

      <form data-bbm-tour="mail-compose" onSubmit={handleSendCampaign} className="bbm-contact-form">
        <h4 className="bbm-contact-subtitle" style={{ marginBottom: 0, fontSize: '1.1rem' }}>
          Compose
        </h4>

        <div
          data-bbm-tour="mail-compose-fields"
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem',
          }}
        >
          <label className="bbm-form-label">
            Subject
            <input className="bbm-form-input" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Newsletter subject" />
          </label>

          <label className="bbm-form-label">
            Message (plain text)
            <textarea
              className="bbm-form-textarea"
              rows={10}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Write your update…"
            />
          </label>
        </div>

        <div className="bbm-form-row">
          <label className="bbm-form-label" data-bbm-tour="mail-test-email">
            Test email
            <input
              className="bbm-form-input"
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
              placeholder="you@gmail.com"
            />
          </label>
          <div
            data-bbm-tour="mail-send-buttons"
            style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end', gap: 10, alignSelf: 'end' }}
          >
            <button
              className="bbm-form-submit"
              type="button"
              onClick={handleSendTest}
              disabled={sendState.status === 'loading'}
              style={{ marginTop: 0, width: 'fit-content' }}
            >
              {sendState.status === 'loading' ? 'Sending…' : 'Send test'}
            </button>

            <button
              className="bbm-form-submit"
              type="submit"
              disabled={sendState.status === 'loading'}
              style={{ marginTop: 0, width: 'fit-content' }}
            >
              {sendState.status === 'loading' ? 'Sending…' : 'Send to subscribers'}
            </button>
          </div>
        </div>

        {progress.total > 0 && sendState.status === 'loading' ? (
          <div className="bbm-form-success" style={{ marginTop: 10 }}>
            Progress: {progress.sent} / {progress.total}
          </div>
        ) : null}

        {sendState.error ? <div className="bbm-form-error">{sendState.error}</div> : null}
        {sendState.info ? <div className="bbm-form-success">{sendState.info}</div> : null}
      </form>
    </div>
  );
}
