import React, { useEffect, useMemo, useState } from 'react';

import { asset } from '../../utils/asset';
import {
  adminNewsletterDeleteSubscribers,
  adminNewsletterGetCampaigns,
  adminNewsletterGetSubscribers,
  adminNewsletterSaveCampaign,
  adminNewsletterSend,
  adminNewsletterSetSubscribers,
  getScheduleApiBase,
} from '../utils/adminApi';

const DEFAULT_CONTENT = {
  preheader: 'Stories, conversations, and mindset shifts from Black Bridge Mindset.',
  intro:
    'Welcome to the bridge. Here is a quick update from Black Bridge Mindset—new conversations, practical perspective, and the ideas that keep us moving forward.',
  sections: [
    { id: 'podcast', title: 'From the podcast', body: 'Share the latest conversation, guest insight, or episode you want the community to hear next.' },
    { id: 'mindset', title: 'Mindset moment', body: 'A short reflection, challenge, or lesson your readers can carry into the week.' },
  ],
  ctaLabel: 'Listen to Black Bridge Mindset',
  ctaUrl: 'https://blackbridgemindset.buzzsprout.com/',
  closing: 'Keep building. Keep crossing.\n\n— Mike, Host of Black Bridge Mindset',
};

function cloneDefaultContent() {
  return JSON.parse(JSON.stringify(DEFAULT_CONTENT));
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function parseEmailList(text) {
  const raw = String(text || '').split(/\r?\n|,/g).map(normalizeEmail).filter(Boolean);
  return [...new Set(raw)];
}

function StatusBox({ state, fallback }) {
  const tone = state?.error ? 'error' : state?.status === 'loading' ? 'neutral' : 'success';
  const message = state?.status === 'loading' ? 'Working…' : state?.error || state?.info || fallback;
  return <div className={`admin-alert admin-alert-${tone}`} role="status" aria-live="polite">{message}</div>;
}

function formatCampaignDate(value) {
  const timestamp = Number(value);
  if (!timestamp) return '';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(timestamp));
}

function campaignStatusLabel(status) {
  return String(status || 'draft').replace(/^./, (letter) => letter.toUpperCase());
}

export default function MailBlastPanel({ sessionEmail }) {
  const apiBase = useMemo(() => getScheduleApiBase(), []);
  const [subscribers, setSubscribers] = useState([]);
  const [labels, setLabels] = useState({});
  const [selected, setSelected] = useState(new Set());
  const [addEmail, setAddEmail] = useState('');
  const [subscribersState, setSubscribersState] = useState({ status: 'loading', error: '', info: '' });

  const [campaigns, setCampaigns] = useState([]);
  const [campaignId, setCampaignId] = useState('');
  const [subject, setSubject] = useState('');
  const [content, setContent] = useState(cloneDefaultContent);
  const [scheduledAtInput, setScheduledAtInput] = useState('');
  const [campaignState, setCampaignState] = useState({ status: 'ready', error: '', info: '' });
  const [testEmail, setTestEmail] = useState(sessionEmail || '');
  const [sendState, setSendState] = useState({ status: 'ready', error: '', info: '' });
  const [progress, setProgress] = useState({ sent: 0, total: 0 });

  async function loadSubscribers() {
    setSubscribersState({ status: 'loading', error: '', info: '' });
    const res = await adminNewsletterGetSubscribers();
    if (!res.ok) {
      setSubscribersState({ status: 'error', error: res.error || 'Failed to load subscribers.', info: '' });
      return;
    }
    const list = Array.isArray(res.data?.subscribers) ? res.data.subscribers : [];
    setSubscribers(list);
    setLabels(res.data?.labels && typeof res.data.labels === 'object' ? res.data.labels : {});
    setSelected(new Set(list));
    setSubscribersState({ status: 'ready', error: '', info: list.length ? `Loaded ${list.length} subscribers.` : 'No subscribers saved yet.' });
  }

  async function loadCampaigns() {
    const res = await adminNewsletterGetCampaigns();
    if (!res.ok) {
      setCampaignState({ status: 'error', error: res.error || 'Failed to load newsletters.', info: '' });
      return;
    }
    setCampaigns(Array.isArray(res.data?.campaigns) ? res.data.campaigns : []);
  }

  useEffect(() => {
    loadSubscribers();
    loadCampaigns();
  }, []);

  function handleAddSubscriber() {
    const list = parseEmailList(addEmail);
    if (list.length === 0) {
      setSubscribersState({ status: 'error', error: 'Enter a valid email address to add.', info: '' });
      return;
    }
    setSubscribers((prev) => {
      const merged = [...prev];
      const seen = new Set(prev);
      list.forEach((email) => { if (!seen.has(email)) { seen.add(email); merged.push(email); } });
      setSelected(new Set(merged));
      return merged;
    });
    setLabels((prev) => {
      const next = { ...prev };
      list.forEach((email) => { if (!next[email]) next[email] = 'subscriber'; });
      return next;
    });
    setAddEmail('');
    setSubscribersState({ status: 'ready', error: '', info: 'Added locally. Save the list to persist it.' });
  }

  async function handleSaveSubscribers(event) {
    event.preventDefault();
    setSubscribersState({ status: 'loading', error: '', info: '' });
    const res = await adminNewsletterSetSubscribers({ subscribers });
    if (!res.ok) {
      setSubscribersState({ status: 'error', error: res.error || 'Failed to save subscribers.', info: '' });
      return;
    }
    const saved = Array.isArray(res.data?.subscribers) ? res.data.subscribers : subscribers;
    setSubscribers(saved);
    setSelected(new Set(saved));
    setLabels(res.data?.labels && typeof res.data.labels === 'object' ? res.data.labels : labels);
    setSubscribersState({ status: 'ready', error: '', info: `Saved ${saved.length} subscribers.` });
  }

  async function handleDeleteSelected() {
    const toDelete = subscribers.filter((email) => selected.has(email));
    if (toDelete.length === 0) {
      setSubscribersState({ status: 'error', error: 'Select at least one subscriber to delete.', info: '' });
      return;
    }
    if (!window.confirm(`Delete ${toDelete.length} selected subscriber${toDelete.length === 1 ? '' : 's'}? This cannot be undone.`)) return;
    setSubscribersState({ status: 'loading', error: '', info: '' });
    const res = await adminNewsletterDeleteSubscribers({ subscribers: toDelete });
    if (!res.ok) {
      setSubscribersState({ status: 'error', error: res.error || 'Failed to delete subscribers.', info: '' });
      return;
    }
    const remaining = Array.isArray(res.data?.subscribers) ? res.data.subscribers : subscribers.filter((email) => !selected.has(email));
    setSubscribers(remaining);
    setSelected(new Set());
    setSubscribersState({ status: 'ready', error: '', info: `Deleted ${res.data?.deleted || toDelete.length} subscriber${toDelete.length === 1 ? '' : 's'}.` });
  }

  function updateContent(field, value) {
    setContent((current) => ({ ...current, [field]: value }));
  }

  function updateSection(index, field, value) {
    setContent((current) => ({
      ...current,
      sections: current.sections.map((section, sectionIndex) => (sectionIndex === index ? { ...section, [field]: value } : section)),
    }));
  }

  function addSection() {
    setContent((current) => ({ ...current, sections: [...current.sections, { id: `section-${Date.now()}`, title: 'New section', body: '' }] }));
  }

  function removeSection(index) {
    setContent((current) => ({ ...current, sections: current.sections.filter((_, sectionIndex) => sectionIndex !== index) }));
  }

  function loadCampaign(campaign) {
    setCampaignId(campaign.id || '');
    setSubject(campaign.subject || '');
    setContent({ ...cloneDefaultContent(), ...(campaign.content || {}), sections: campaign.content?.sections || [] });
    setScheduledAtInput(campaign.scheduledAt ? new Date(campaign.scheduledAt).toISOString().slice(0, 16) : '');
    setCampaignState({ status: 'ready', error: '', info: `Loaded ${campaignStatusLabel(campaign.status).toLowerCase()} newsletter.` });
  }

  async function saveCampaign(status) {
    setCampaignState({ status: 'loading', error: '', info: '' });
    const scheduledAt = status === 'scheduled' ? Date.parse(scheduledAtInput) : null;
    const res = await adminNewsletterSaveCampaign({ id: campaignId, subject, content, status, scheduledAt });
    if (!res.ok) {
      setCampaignState({ status: 'error', error: res.error || 'Failed to save newsletter.', info: '' });
      return;
    }
    const campaign = res.data?.campaign;
    if (campaign?.id) setCampaignId(campaign.id);
    if (campaign) setCampaigns((current) => [campaign, ...current.filter((item) => item.id !== campaign.id)]);
    setCampaignState({ status: 'ready', error: '', info: status === 'scheduled' ? 'Newsletter scheduled.' : 'Draft saved.' });
  }

  async function handleSendTest(event) {
    event.preventDefault();
    setSendState({ status: 'loading', error: '', info: '' });
    const cleanTest = normalizeEmail(testEmail);
    if (!cleanTest || !cleanTest.includes('@')) {
      setSendState({ status: 'error', error: 'Enter a valid test email.', info: '' });
      return;
    }
    const res = await adminNewsletterSend({ subject, message: content.intro, content, testEmail: cleanTest });
    setSendState(res.ok ? { status: 'ready', error: '', info: `Test newsletter sent to ${cleanTest}.` } : { status: 'error', error: res.error || 'Failed to send test newsletter.', info: '' });
  }

  async function handleSendCampaign(event) {
    event.preventDefault();
    setSendState({ status: 'loading', error: '', info: '' });
    const recipients = subscribers.filter((email) => selected.has(email));
    if (recipients.length === 0) {
      setSendState({ status: 'error', error: 'Select at least one newsletter recipient.', info: '' });
      return;
    }
    const batchSize = 50;
    setProgress({ sent: 0, total: recipients.length });
    for (let index = 0; index < recipients.length; index += batchSize) {
      const batch = recipients.slice(index, index + batchSize);
      const res = await adminNewsletterSend({ subject, message: content.intro, content, recipients: batch, campaignId });
      if (!res.ok) {
        setSendState({ status: 'error', error: res.error || 'Failed while sending newsletter.', info: '' });
        return;
      }
      setProgress((current) => ({ ...current, sent: Math.min(recipients.length, current.sent + batch.length) }));
    }
    setSendState({ status: 'ready', error: '', info: `Newsletter sent to ${recipients.length} recipients.` });
    loadCampaigns();
  }

  return (
    <div className="newsletter-builder">
      <div className="admin-panel-heading newsletter-builder-heading">
        <div><p className="admin-eyebrow">Community email</p><h1>Newsletter</h1><p>Build thoughtful updates for the Black Bridge Mindset community.</p></div>
        <span className="admin-inline-note">{apiBase ? `API: ${apiBase}` : 'Worker-connected'}</span>
      </div>

      <div className="newsletter-builder-actions" data-bbm-tour="mail-builder-actions">
        <button className="admin-secondary-button" type="button" onClick={() => { setCampaignId(''); setSubject(''); setContent(cloneDefaultContent()); setScheduledAtInput(''); setCampaignState({ status: 'ready', error: '', info: 'New newsletter started.' }); }}>New</button>
        <button className="admin-secondary-button" type="button" onClick={() => saveCampaign('draft')} disabled={campaignState.status === 'loading'}>Save draft</button>
        <button className="admin-secondary-button" type="button" onClick={() => saveCampaign('scheduled')} disabled={campaignState.status === 'loading'}>Schedule</button>
        <button className="admin-primary-button" type="button" onClick={handleSendCampaign} disabled={sendState.status === 'loading'}>Send newsletter</button>
      </div>

      <div className="newsletter-builder-grid">
        <section className="admin-panel newsletter-editor-panel" data-bbm-tour="mail-builder-fields">
          <div className="admin-section-heading"><div><p className="admin-eyebrow">Editor</p><h2>Build your newsletter</h2></div>{campaignId ? <span className="admin-inline-note">Editing saved draft</span> : null}</div>
          <label className="admin-form-label">Subject<input className="admin-form-input" value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="A new bridge to cross" /></label>
          <label className="admin-form-label">Preview text<input className="admin-form-input" value={content.preheader} onChange={(event) => updateContent('preheader', event.target.value)} placeholder="What readers see before opening" /></label>
          <label className="admin-form-label">Opening message<textarea className="admin-form-textarea" rows={5} value={content.intro} onChange={(event) => updateContent('intro', event.target.value)} /></label>

          <div className="newsletter-sections-heading"><div><strong>Newsletter sections</strong><span>Use short, useful blocks readers can act on.</span></div><button className="admin-secondary-button" type="button" onClick={addSection} disabled={content.sections.length >= 6}>Add section</button></div>
          <div className="newsletter-section-list">
            {content.sections.map((section, index) => (
              <div className="newsletter-section-card" key={section.id || index}>
                <div className="newsletter-section-card-heading"><strong>Section {index + 1}</strong><button className="admin-text-button" type="button" onClick={() => removeSection(index)}>Remove</button></div>
                <label className="admin-form-label">Section title<input className="admin-form-input" value={section.title} onChange={(event) => updateSection(index, 'title', event.target.value)} /></label>
                <label className="admin-form-label">Section copy<textarea className="admin-form-textarea" rows={4} value={section.body} onChange={(event) => updateSection(index, 'body', event.target.value)} /></label>
              </div>
            ))}
          </div>

          <div className="newsletter-two-column"><label className="admin-form-label">Button label<input className="admin-form-input" value={content.ctaLabel} onChange={(event) => updateContent('ctaLabel', event.target.value)} /></label><label className="admin-form-label">Button link<input className="admin-form-input" value={content.ctaUrl} onChange={(event) => updateContent('ctaUrl', event.target.value)} /></label></div>
          <label className="admin-form-label">Closing<textarea className="admin-form-textarea" rows={4} value={content.closing} onChange={(event) => updateContent('closing', event.target.value)} /></label>
          <StatusBox state={campaignState} fallback="Draft is ready to edit." />
          <div className="newsletter-schedule-row"><label className="admin-form-label">Schedule date and time<input className="admin-form-input" type="datetime-local" value={scheduledAtInput} onChange={(event) => setScheduledAtInput(event.target.value)} /></label><span>Scheduled newsletters are sent automatically by the Worker every 15 minutes.</span></div>
        </section>

        <section className="admin-panel newsletter-preview-panel" data-bbm-tour="mail-preview">
          <div className="admin-section-heading"><div><p className="admin-eyebrow">Preview</p><h2>Email preview</h2></div><span className="admin-inline-note">Live preview</span></div>
          <div className="newsletter-preview-frame">
            <div className="newsletter-preview-header"><img src={asset('images/bbmlogo.png')} alt="Black Bridge Mindset" /><div><strong>Black Bridge Mindset</strong><span>The conversations that carry us forward.</span></div></div>
            <div className="newsletter-preview-body"><p className="newsletter-preview-kicker">BLACK BRIDGE MINDSET</p><h3>{subject || 'A new bridge to cross'}</h3><p className="newsletter-preview-intro">{content.intro || 'Your opening message will appear here.'}</p>{content.sections.map((section, index) => <div className="newsletter-preview-section" key={section.id || index}><strong>{section.title || 'Section title'}</strong><p>{section.body || 'Section copy will appear here.'}</p></div>)}{content.ctaLabel && content.ctaUrl ? <div className="newsletter-preview-cta">{content.ctaLabel}</div> : null}<p className="newsletter-preview-closing">{content.closing}</p></div>
            <div className="newsletter-preview-footer">You’re receiving this because you joined the Black Bridge Mindset community.<br />Keep building. Keep crossing.</div>
          </div>
          <form className="newsletter-test-form" onSubmit={handleSendTest} data-bbm-tour="mail-test-email"><label className="admin-form-label">Test email<input className="admin-form-input" value={testEmail} onChange={(event) => setTestEmail(event.target.value)} placeholder="you@example.com" /></label><button className="admin-secondary-button" type="submit" disabled={sendState.status === 'loading'}>Send test</button></form>
          <StatusBox state={sendState} fallback="No newsletter has been sent from this draft." />
          {progress.total > 0 ? <div className="admin-progress">Progress: {progress.sent} / {progress.total}</div> : null}
        </section>
      </div>

      <section className="admin-panel newsletter-campaigns-panel"><div className="admin-section-heading"><div><p className="admin-eyebrow">Archive</p><h2>Recent newsletters</h2></div><button className="admin-secondary-button" type="button" onClick={loadCampaigns}>Refresh</button></div>{campaigns.length === 0 ? <div className="admin-empty-state"><strong>No saved newsletters yet.</strong><span>Save a draft or schedule your first community update.</span></div> : <div className="newsletter-campaign-list">{campaigns.map((campaign) => <button className="newsletter-campaign-row" type="button" key={campaign.id} onClick={() => loadCampaign(campaign)}><span><strong>{campaign.subject}</strong><small>{formatCampaignDate(campaign.updatedAt)}</small></span><em className={`newsletter-status newsletter-status-${campaign.status}`}>{campaignStatusLabel(campaign.status)}</em></button>)}</div>}</section>

      <section className="admin-panel newsletter-subscribers-panel" data-bbm-tour="mail-subscribers-manage"><div className="admin-section-heading"><div><p className="admin-eyebrow">Audience</p><h2>Subscribers</h2><p>Select recipients for this send, or select the subscribers you want to delete.</p></div><span className="admin-inline-note">{selected.size} selected of {subscribers.length}</span></div>
        <form onSubmit={handleSaveSubscribers}>
          <div className="newsletter-subscriber-toolbar"><label className="admin-form-label">Add address<input className="admin-form-input" value={addEmail} onChange={(event) => setAddEmail(event.target.value)} placeholder="person@example.com" /></label><button className="admin-secondary-button" type="button" onClick={handleAddSubscriber}>Add</button><button className="admin-secondary-button" type="button" onClick={() => setSelected(new Set(subscribers))}>Select all</button><button className="admin-secondary-button" type="button" onClick={() => setSelected(new Set())}>Select none</button></div>
          <div className="admin-subscriber-list">{subscribers.length === 0 ? <div className="admin-empty-state"><strong>No subscribers yet.</strong><span>New website subscribers will appear here.</span></div> : subscribers.map((email) => <label className="admin-subscriber-row" key={email}><input type="checkbox" checked={selected.has(email)} onChange={(event) => setSelected((current) => { const next = new Set(current); if (event.target.checked) next.add(email); else next.delete(email); return next; })} /><span className="admin-subscriber-email">{email}</span><span className="admin-subscriber-type">{String(labels?.[email] || 'subscriber')}</span></label>)}</div>
          <StatusBox state={subscribersState} fallback="Subscriber list is ready." />
          <div className="newsletter-subscriber-actions"><button className="admin-primary-button" type="submit" disabled={subscribersState.status === 'loading'}>Save list</button><button className="admin-danger-button" type="button" onClick={handleDeleteSelected} disabled={subscribersState.status === 'loading' || selected.size === 0}>Delete selected</button></div>
        </form>
      </section>
    </div>
  );
}
