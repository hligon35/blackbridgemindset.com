import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import AdminShell from './AdminShell';

import {
  adminCreateInvite,
  adminGetAvailability,
  adminGetSession,
  adminLogout,
  adminSetAvailability,
} from './utils/adminApi';

import AdminCarouselNav from './components/AdminCarouselNav';
import MailBlastPanel from './components/MailBlastPanel';
import ActivityLog from './ActivityLog';
import SubmissionsInbox from './SubmissionsInbox';
import { useAdminToast } from './components/AdminToast';

function defaultAvailability() {
  return {
    timezone: 'America/Chicago',
    slotDurationMinutes: 30,
    daysAhead: 14,
    startDaysFromNow: 1,
    days: [
      { enabled: false, start: '09:00', end: '17:00' }, // Sun
      { enabled: true, start: '09:00', end: '17:00' }, // Mon
      { enabled: true, start: '09:00', end: '17:00' }, // Tue
      { enabled: true, start: '09:00', end: '17:00' }, // Wed
      { enabled: true, start: '09:00', end: '17:00' }, // Thu
      { enabled: true, start: '09:00', end: '17:00' }, // Fri
      { enabled: false, start: '09:00', end: '17:00' }, // Sat
    ],
  };
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function availabilitySignature(value) {
  try {
    return JSON.stringify(value || null);
  } catch {
    return '';
  }
}

export default function ScheduleAdminPage({ skipSessionCheck = false, sessionEmail = null, onUnauthorized, onLoggedOut }) {
  useEffect(() => {
    document.title = 'Admin Dashboard | Black Bridge Mindset';
  }, []);

  const navigate = useNavigate();

  const helpBtnRef = useRef(null);
  const helpPopoverRef = useRef(null);
  const tourTooltipRef = useRef(null);

  const TIMEZONE_OPTIONS = [
    'America/Chicago',
    'America/New_York',
    'America/Denver',
    'America/Los_Angeles',
    'America/Phoenix',
    'America/Anchorage',
    'Pacific/Honolulu',
    'UTC',
  ];

  const SLOT_DURATION_OPTIONS = Array.from({ length: 12 }, (_, i) => (i + 1) * 15); // 15..180 by 15
  const DAYS_AHEAD_OPTIONS = Array.from({ length: 60 }, (_, i) => i + 1); // 1..60
  const START_DAYS_OPTIONS = Array.from({ length: 15 }, (_, i) => i); // 0..14

  const HOUR_OPTIONS = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0')); // 01..12
  const MINUTE_OPTIONS = ['00', '15', '30', '45'];
  const MERIDIEM_OPTIONS = ['AM', 'PM'];

  function splitHHMM(value, fallback = { hh: '09', mm: '00', ampm: 'AM' }) {
    const v = String(value || '').trim();
    const m = v.match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return fallback;

    const hh24 = Number(m[1]);
    const mm = String(m[2]).padStart(2, '0');
    if (!Number.isFinite(hh24) || hh24 < 0 || hh24 > 23) return fallback;
    if (!MINUTE_OPTIONS.includes(mm)) return fallback;

    const ampm = hh24 >= 12 ? 'PM' : 'AM';
    const hh12n = hh24 % 12 === 0 ? 12 : hh24 % 12;
    const hh = String(hh12n).padStart(2, '0');
    if (!HOUR_OPTIONS.includes(hh)) return fallback;
    if (!MERIDIEM_OPTIONS.includes(ampm)) return fallback;

    return { hh, mm, ampm };
  }

  function toHHMM(hh, mm, ampm) {
    const cleanHh = String(hh).padStart(2, '0');
    const cleanMm = String(mm).padStart(2, '0');
    const cleanAmPm = String(ampm || 'AM').toUpperCase();

    if (!HOUR_OPTIONS.includes(cleanHh)) return '09:00';
    if (!MINUTE_OPTIONS.includes(cleanMm)) return '09:00';
    if (!MERIDIEM_OPTIONS.includes(cleanAmPm)) return '09:00';

    const h12 = Number(cleanHh);
    const base = h12 % 12;
    const h24 = cleanAmPm === 'PM' ? base + 12 : base;
    const H = String(h24).padStart(2, '0');
    return `${H}:${cleanMm}`;
  }

  const [sessionState, setSessionState] = useState({
    status: skipSessionCheck ? 'ready' : 'loading',
    email: sessionEmail,
  });

  const [activePanel, setActivePanel] = useState('inbox');

  const tours = useMemo(
    () => ({
      inbox: [
        {
          target: 'admin-tab-inbox',
          title: 'Inbox',
          body: 'Website contact form submissions land here. Mark them read or archive them once handled.',
        },
      ],
      activity: [
        {
          target: 'admin-tab-activity',
          title: 'Activity',
          body: 'A timeline of admin actions: logins/logouts, availability updates, newsletter sends, invites, and inbox changes.',
        },
      ],
      scheduler: [
        {
          target: 'admin-tab-scheduler',
          title: 'Scheduler',
          body: 'This is the Scheduler panel. It controls availability + guest invite links.',
        },
        {
          target: 'scheduler-top-controls',
          title: 'Top settings',
          body: 'Set your timezone, slot duration, and booking window.',
        },
        {
          target: 'scheduler-weekly-hours-grid',
          title: 'Weekly hours',
          body: 'Enable days and pick start/end times for your bookable schedule.',
        },
        {
          target: 'scheduler-save-availability',
          title: 'Save',
          body: 'Click to publish the availability settings.',
        },
        {
          target: 'scheduler-invite-fields',
          title: 'Guest invite link',
          body: 'Generate a private scheduling link for a specific guest (name + email + expiration).',
        },
      ],
      mail: [
        {
          target: 'admin-tab-mail',
          title: 'Newsletter',
          body: 'Build branded Black Bridge Mindset newsletters, preview them, save drafts, schedule delivery, or send a test.',
        },
        {
          target: 'mail-subscribers-manage',
          title: 'Subscribers',
          body: 'Add subscribers, use checkboxes to select recipients, or delete the selected addresses.',
        },
        {
          target: 'mail-builder-fields',
          title: 'Newsletter builder',
          body: 'Create an opening message, reusable content sections, a call-to-action, and a branded closing.',
        },
        {
          target: 'mail-test-email',
          title: 'Send a test',
          body: 'Send a test email to yourself (or any address) before mailing the full list.',
        },
        {
          target: 'mail-builder-actions',
          title: 'Publish controls',
          body: 'Save a draft, schedule it for later, send a test, or send the newsletter to the selected audience.',
        },
      ],
    }),
    []
  );

  const [helpOpen, setHelpOpen] = useState(false);
  const [helpAnchor, setHelpAnchor] = useState({ top: 0, left: 0 });

  const [tour, setTour] = useState({ active: false, id: null, step: 0 });
  const [tourTargetRect, setTourTargetRect] = useState(null);
  const [tourPlacement, setTourPlacement] = useState('right');
  const [tourTooltipPos, setTourTooltipPos] = useState({ top: 20, left: 20 });

  const activeTourSteps = tour.active && tour.id && tours[tour.id] ? tours[tour.id] : [];
  const activeStep = activeTourSteps[tour.step] || null;

  function stopTour() {
    setTour({ active: false, id: null, step: 0 });
    setTourTargetRect(null);
  }

  function startTour(id) {
    const nextPanel = id === 'mail' ? 'mail' : id === 'scheduler' ? 'scheduler' : id;
    setHelpOpen(false);
    setActivePanel(nextPanel);
    setTour({ active: true, id, step: 0 });
  }

  function nextTourStep() {
    if (!tour.active) return;
    const steps = activeTourSteps;
    const last = Math.max(0, steps.length - 1);
    if (tour.step >= last) {
      stopTour();
      return;
    }
    setTour((t) => ({ ...t, step: t.step + 1 }));
  }

  function prevTourStep() {
    if (!tour.active) return;
    setTour((t) => ({ ...t, step: Math.max(0, t.step - 1) }));
  }

  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === 'Escape') {
        if (helpOpen) setHelpOpen(false);
        if (tour.active) stopTour();
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [helpOpen, tour.active]);

  useEffect(() => {
    if (!helpOpen) return;

    function onPointerDown(e) {
      const t = e.target;
      if (!(t instanceof Element)) return;
      if (helpBtnRef.current && helpBtnRef.current.contains(t)) return;
      if (helpPopoverRef.current && helpPopoverRef.current.contains(t)) return;
      setHelpOpen(false);
    }

    window.addEventListener('pointerdown', onPointerDown);
    return () => window.removeEventListener('pointerdown', onPointerDown);
  }, [helpOpen]);

  useLayoutEffect(() => {
    if (!helpOpen) return;
    const btn = helpBtnRef.current;
    if (!btn) return;

    const rect = btn.getBoundingClientRect();
    const padding = 12;
    const popoverWidth = 220;
    const left = Math.min(Math.max(padding, rect.left), Math.max(padding, window.innerWidth - popoverWidth - padding));
    const top = rect.bottom + 10;
    setHelpAnchor({ top, left });
  }, [helpOpen]);

  useLayoutEffect(() => {
    if (!tour.active || !activeStep) return;

    let raf = 0;
    function measure() {
      const el = document.querySelector(`[data-bbm-tour="${activeStep.target}"]`);
      if (!(el instanceof HTMLElement)) {
        setTourTargetRect(null);
        return;
      }

      try {
        el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
      } catch {
        // ignore
      }

      const rect = el.getBoundingClientRect();

      const padAttr = el.getAttribute('data-bbm-tour-pad');
      const padRaw = padAttr ? Number(padAttr) : 6;
      const pad = Number.isFinite(padRaw) ? Math.max(0, Math.min(20, padRaw)) : 6;

      const top = Math.max(0, rect.top - pad);
      const left = Math.max(0, rect.left - pad);
      const width = Math.min(window.innerWidth - left, rect.width + pad * 2);
      const height = Math.min(window.innerHeight - top, rect.height + pad * 2);

      let radius = 16;
      try {
        const cr = parseFloat(getComputedStyle(el).borderRadius || '');
        if (Number.isFinite(cr)) radius = cr;
      } catch {
        // ignore
      }
      const borderRadius = Math.min(24, Math.max(10, radius + 4));

      setTourTargetRect({ top, left, width, height, borderRadius });
    }

    raf = window.requestAnimationFrame(measure);
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [tour.active, tour.id, tour.step, activePanel, activeStep]);

  useLayoutEffect(() => {
    if (!tour.active) return;
    if (!tourTargetRect) return;
    const tip = tourTooltipRef.current;
    if (!tip) return;

    const padding = 12;
    const rect = tourTargetRect;
    const tipRect = tip.getBoundingClientRect();

    const spaceRight = window.innerWidth - (rect.left + rect.width);
    const spaceLeft = rect.left;
    const spaceBottom = window.innerHeight - (rect.top + rect.height);

    let placement = 'right';
    if (spaceRight >= tipRect.width + padding) placement = 'right';
    else if (spaceLeft >= tipRect.width + padding) placement = 'left';
    else if (spaceBottom >= tipRect.height + padding) placement = 'bottom';
    else placement = 'top';

    const clamp = (n, min, max) => Math.min(Math.max(n, min), max);

    let top = padding;
    let left = padding;
    if (placement === 'right') {
      left = rect.left + rect.width + 14;
      top = clamp(rect.top + rect.height / 2 - tipRect.height / 2, padding, window.innerHeight - tipRect.height - padding);
    } else if (placement === 'left') {
      left = rect.left - tipRect.width - 14;
      top = clamp(rect.top + rect.height / 2 - tipRect.height / 2, padding, window.innerHeight - tipRect.height - padding);
    } else if (placement === 'bottom') {
      left = clamp(rect.left + rect.width / 2 - tipRect.width / 2, padding, window.innerWidth - tipRect.width - padding);
      top = rect.top + rect.height + 14;
    } else {
      left = clamp(rect.left + rect.width / 2 - tipRect.width / 2, padding, window.innerWidth - tipRect.width - padding);
      top = rect.top - tipRect.height - 14;
    }

    setTourPlacement(placement);
    setTourTooltipPos({ top, left });
  }, [tour.active, tourTargetRect, tour.step]);

  const [availabilityState, setAvailabilityState] = useState({ status: 'idle', data: null, error: null });
  const [availabilityDraft, setAvailabilityDraft] = useState(defaultAvailability());

  const isAvailabilitySaved = useMemo(() => {
    if (availabilityState.status !== 'ready') return false;
    if (!availabilityState.data) return false;
    return availabilitySignature(availabilityDraft) === availabilitySignature(availabilityState.data);
  }, [availabilityDraft, availabilityState.data, availabilityState.status]);

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [inviteDays, setInviteDays] = useState('7');
  const [inviteState, setInviteState] = useState({ status: 'idle', data: null, error: null });
  const { notify } = useAdminToast();

  const adminPanels = useMemo(
    () => [
      { id: 'inbox', label: 'Inbox', description: 'Website submissions' },
      { id: 'activity', label: 'Activity', description: 'Admin history' },
      { id: 'scheduler', label: 'Scheduler', description: 'Availability + invite links' },
      { id: 'mail', label: 'Newsletter', description: 'Build and send community updates' },
    ],
    []
  );

  useEffect(() => {
    let cancelled = false;

    async function checkSession() {
      if (skipSessionCheck) {
        setSessionState({ status: 'ready', email: sessionEmail || null });
        return;
      }

      const res = await adminGetSession();
      if (cancelled) return;

      if (!res.ok || !res.data?.ok) {
        setSessionState({ status: 'unauthorized', email: null });
        if (typeof onUnauthorized === 'function') {
          onUnauthorized();
        } else {
          navigate('/admin', { replace: true });
        }
        return;
      }

      setSessionState({ status: 'ready', email: res.data.email || null });
    }

    checkSession();
    return () => {
      cancelled = true;
    };
  }, [navigate, onUnauthorized, sessionEmail, skipSessionCheck]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (sessionState.status !== 'ready') return;

      setAvailabilityState({ status: 'loading', data: null, error: null });
      const res = await adminGetAvailability();
      if (cancelled) return;

      if (!res.ok) {
        setAvailabilityState({ status: 'error', data: null, error: res.error || 'Failed to load availability' });
        notify({ tone: 'error', message: res.error || 'Failed to load availability.' });
        return;
      }

      const merged = res.data?.availability ? res.data.availability : defaultAvailability();
      setAvailabilityDraft(merged);
      setAvailabilityState({ status: 'ready', data: merged, error: null });
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [notify, sessionState.status]);

  async function handleLogout() {
    await adminLogout();
    if (typeof onLoggedOut === 'function') {
      onLoggedOut();
    } else {
      navigate('/admin', { replace: true });
    }
  }

  async function handleSaveAvailability(e) {
    e.preventDefault();
    if (sessionState.status !== 'ready') return;

    const previousAvailability = availabilityState.data;
    setAvailabilityState((s) => ({ ...s, status: 'saving', error: null }));
    const res = await adminSetAvailability({ availability: availabilityDraft });

    if (!res.ok) {
      setAvailabilityState({ status: 'error', data: null, error: res.error || 'Failed to save availability' });
      notify({ tone: 'error', message: res.error || 'Failed to save availability.' });
      return;
    }

    setAvailabilityState({ status: 'ready', data: availabilityDraft, error: null });
    notify({
      message: 'Availability saved.',
      onUndo: previousAvailability
        ? async () => {
            const restore = await adminSetAvailability({ availability: previousAvailability });
            if (!restore.ok) throw new Error(restore.error || 'Unable to undo availability save.');
            setAvailabilityDraft(previousAvailability);
            setAvailabilityState({ status: 'ready', data: previousAvailability, error: null });
          }
        : undefined,
    });
  }

  async function handleCreateInvite(e) {
    e.preventDefault();
    if (sessionState.status !== 'ready') return;

    const cleanName = String(inviteName || '').trim();
    if (!cleanName) {
      setInviteState({ status: 'error', data: null, error: 'Guest name is required.' });
      notify({ tone: 'error', message: 'Guest name is required.' });
      return;
    }
    if (cleanName.length > 80) {
      setInviteState({ status: 'error', data: null, error: 'Guest name too long (max 80).' });
      notify({ tone: 'error', message: 'Guest name too long (max 80).' });
      return;
    }

    setInviteState({ status: 'loading', data: null, error: null });
    const res = await adminCreateInvite({ email: inviteEmail, days: inviteDays, name: cleanName });

    if (!res.ok) {
      setInviteState({ status: 'error', data: null, error: res.error || 'Failed to generate link' });
      notify({ tone: 'error', message: res.error || 'Failed to generate invite link.' });
      return;
    }

    setInviteState({ status: 'ready', data: res.data, error: null });
    notify({ message: `Invite link created and emailed to ${inviteEmail}.` });
  }

  return (
    <AdminShell email={sessionState.email} onLogout={handleLogout}>
      <section className="admin-dashboard-section">
        <div className="admin-dashboard-heading">
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
            <div>
              <p className="admin-eyebrow">Workspace</p>
              <h1>Dashboard</h1>
            </div>
            <button
              ref={helpBtnRef}
              className="bbm-help-btn"
              type="button"
              aria-label="Open admin help"
              title="Open admin help"
              aria-haspopup="menu"
              aria-expanded={helpOpen}
              onClick={() => setHelpOpen((v) => !v)}
            >
              ?
            </button>
          </div>
        </div>

        {helpOpen ? (
          <div
            ref={helpPopoverRef}
            className="bbm-help-popover"
            role="menu"
            style={{ top: helpAnchor.top, left: helpAnchor.left }}
          >
            <div className="bbm-help-heading">Admin help</div>
            <button className="bbm-help-item" type="button" role="menuitem" onClick={() => startTour('inbox')}>
              Inbox
            </button>
            <button className="bbm-help-item" type="button" role="menuitem" onClick={() => startTour('activity')}>
              Activity log
            </button>
            <button className="bbm-help-item" type="button" role="menuitem" onClick={() => startTour('scheduler')}>
              Scheduler
            </button>
            <button className="bbm-help-item" type="button" role="menuitem" onClick={() => startTour('mail')}>
              Newsletter
            </button>
          </div>
        ) : null}

        {sessionState.status !== 'ready' ? (
          <p className="bbm-contact-text" style={{ textAlign: 'center' }}>Checking session…</p>
        ) : (
          <div className="admin-workspace">
            <div data-bbm-tour="admin-panels">
              <AdminCarouselNav items={adminPanels} activeId={activePanel} onChange={setActivePanel} />
            </div>

            {activePanel === 'inbox' ? (
              <SubmissionsInbox />
            ) : activePanel === 'activity' ? (
              <ActivityLog />
            ) : activePanel === 'scheduler' ? (
              <>
                <form data-bbm-tour="scheduler-availability" onSubmit={handleSaveAvailability} className="bbm-contact-form">
                  <h3 className="bbm-contact-subtitle" style={{ textAlign: 'center' }}>Availability</h3>

                  <div
                    data-bbm-tour="scheduler-top-controls"
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                      gap: 10,
                      alignItems: 'end',
                    }}
                  >
                    <label className="bbm-form-label" style={{ margin: 0 }}>
                      Timezone
                      <select
                        className="bbm-form-input"
                        value={availabilityDraft.timezone}
                        onChange={(e) => setAvailabilityDraft((d) => ({ ...d, timezone: e.target.value }))}
                      >
                        {(TIMEZONE_OPTIONS.includes(availabilityDraft.timezone)
                          ? TIMEZONE_OPTIONS
                          : [availabilityDraft.timezone, ...TIMEZONE_OPTIONS]
                        ).map((tz) => (
                          <option key={tz} value={tz}>
                            {tz}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="bbm-form-label" style={{ margin: 0 }}>
                      Time slot
                      <select
                        className="bbm-form-input"
                        value={availabilityDraft.slotDurationMinutes}
                        onChange={(e) =>
                          setAvailabilityDraft((d) => ({
                            ...d,
                            slotDurationMinutes: Number(e.target.value),
                          }))
                        }
                      >
                        {(SLOT_DURATION_OPTIONS.includes(availabilityDraft.slotDurationMinutes)
                          ? SLOT_DURATION_OPTIONS
                          : [availabilityDraft.slotDurationMinutes, ...SLOT_DURATION_OPTIONS]
                        ).map((m) => (
                          <option key={m} value={m}>
                            {m} min
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="bbm-form-label" style={{ margin: 0 }}>
                      Days ahead
                      <select
                        className="bbm-form-input"
                        value={availabilityDraft.daysAhead}
                        onChange={(e) => setAvailabilityDraft((d) => ({ ...d, daysAhead: Number(e.target.value) }))}
                      >
                        {(DAYS_AHEAD_OPTIONS.includes(availabilityDraft.daysAhead)
                          ? DAYS_AHEAD_OPTIONS
                          : [availabilityDraft.daysAhead, ...DAYS_AHEAD_OPTIONS]
                        ).map((n) => (
                          <option key={n} value={n}>
                            {n}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="bbm-form-label" style={{ margin: 0 }}>
                      Start days
                      <select
                        className="bbm-form-input"
                        value={availabilityDraft.startDaysFromNow}
                        onChange={(e) =>
                          setAvailabilityDraft((d) => ({
                            ...d,
                            startDaysFromNow: Number(e.target.value),
                          }))
                        }
                      >
                        {(START_DAYS_OPTIONS.includes(availabilityDraft.startDaysFromNow)
                          ? START_DAYS_OPTIONS
                          : [availabilityDraft.startDaysFromNow, ...START_DAYS_OPTIONS]
                        ).map((n) => (
                          <option key={n} value={n}>
                            {n}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <div className="scheduler-weekly-section">
                    <div className="bbm-contact-subtitle scheduler-weekly-title">Weekly hours</div>
                    <div className="scheduler-weekly-grid" data-bbm-tour="scheduler-weekly-hours-grid">
                      <div className="scheduler-grid-header" aria-hidden="true">
                        <span>Day</span>
                        <span>Starts</span>
                        <span aria-hidden="true" />
                        <span>Ends</span>
                      </div>
                      {availabilityDraft.days.map((day, idx) => (
                        <div
                          key={idx}
                          className={`scheduler-hours-row ${day.enabled ? 'is-enabled' : 'is-disabled'}`}
                        >
                          <label className="scheduler-day-toggle">
                            <input
                              type="checkbox"
                              checked={day.enabled}
                              onChange={(e) =>
                                setAvailabilityDraft((d) => ({
                                  ...d,
                                  days: d.days.map((x, i) => (i === idx ? { ...x, enabled: e.target.checked } : x)),
                                }))
                              }
                            />
                            <span className="scheduler-day-name">{DAY_LABELS[idx]}</span>
                            <span className="scheduler-day-status">{day.enabled ? 'Available' : 'Off'}</span>
                          </label>

                          {(() => {
                            const startParts = splitHHMM(day.start, { hh: '09', mm: '00', ampm: 'AM' });
                            return (
                              <div className="scheduler-time-controls scheduler-start-controls">
                                <select
                                  className="bbm-form-input"
                                  value={startParts.hh}
                                  disabled={!day.enabled}
                                  onChange={(e) =>
                                    setAvailabilityDraft((d) => ({
                                      ...d,
                                      days: d.days.map((x, i) =>
                                        i === idx ? { ...x, start: toHHMM(e.target.value, startParts.mm, startParts.ampm) } : x
                                      ),
                                    }))
                                  }
                                >
                                  {HOUR_OPTIONS.map((hh) => (
                                    <option key={hh} value={hh}>
                                      {hh}
                                    </option>
                                  ))}
                                </select>
                                <span style={{ opacity: 0.85 }}>:</span>
                                <select
                                  className="bbm-form-input"
                                  value={startParts.mm}
                                  disabled={!day.enabled}
                                  onChange={(e) =>
                                    setAvailabilityDraft((d) => ({
                                      ...d,
                                      days: d.days.map((x, i) =>
                                        i === idx ? { ...x, start: toHHMM(startParts.hh, e.target.value, startParts.ampm) } : x
                                      ),
                                    }))
                                  }
                                >
                                  {MINUTE_OPTIONS.map((mm) => (
                                    <option key={mm} value={mm}>
                                      {mm}
                                    </option>
                                  ))}
                                </select>

                                <select
                                  className="bbm-form-input"
                                  value={startParts.ampm}
                                  disabled={!day.enabled}
                                  onChange={(e) =>
                                    setAvailabilityDraft((d) => ({
                                      ...d,
                                      days: d.days.map((x, i) =>
                                        i === idx ? { ...x, start: toHHMM(startParts.hh, startParts.mm, e.target.value) } : x
                                      ),
                                    }))
                                  }
                                >
                                  {MERIDIEM_OPTIONS.map((m) => (
                                    <option key={m} value={m}>
                                      {m}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            );
                          })()}

                          <span className="scheduler-time-separator" aria-hidden="true">to</span>

                          {(() => {
                            const endParts = splitHHMM(day.end, { hh: '05', mm: '00', ampm: 'PM' });
                            return (
                              <div className="scheduler-time-controls scheduler-end-controls">
                                <select
                                  className="bbm-form-input"
                                  value={endParts.hh}
                                  disabled={!day.enabled}
                                  onChange={(e) =>
                                    setAvailabilityDraft((d) => ({
                                      ...d,
                                      days: d.days.map((x, i) =>
                                        i === idx ? { ...x, end: toHHMM(e.target.value, endParts.mm, endParts.ampm) } : x
                                      ),
                                    }))
                                  }
                                >
                                  {HOUR_OPTIONS.map((hh) => (
                                    <option key={hh} value={hh}>
                                      {hh}
                                    </option>
                                  ))}
                                </select>
                                <span style={{ opacity: 0.85 }}>:</span>
                                <select
                                  className="bbm-form-input"
                                  value={endParts.mm}
                                  disabled={!day.enabled}
                                  onChange={(e) =>
                                    setAvailabilityDraft((d) => ({
                                      ...d,
                                      days: d.days.map((x, i) =>
                                        i === idx ? { ...x, end: toHHMM(endParts.hh, e.target.value, endParts.ampm) } : x
                                      ),
                                    }))
                                  }
                                >
                                  {MINUTE_OPTIONS.map((mm) => (
                                    <option key={mm} value={mm}>
                                      {mm}
                                    </option>
                                  ))}
                                </select>

                                <select
                                  className="bbm-form-input"
                                  value={endParts.ampm}
                                  disabled={!day.enabled}
                                  onChange={(e) =>
                                    setAvailabilityDraft((d) => ({
                                      ...d,
                                      days: d.days.map((x, i) =>
                                        i === idx ? { ...x, end: toHHMM(endParts.hh, endParts.mm, e.target.value) } : x
                                      ),
                                    }))
                                  }
                                >
                                  {MERIDIEM_OPTIONS.map((m) => (
                                    <option key={m} value={m}>
                                      {m}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            );
                          })()}
                        </div>
                      ))}
                    </div>
                    <p className="bbm-contact-text scheduler-timezone-note">
                      Times are interpreted in <b>{availabilityDraft.timezone}</b>.
                    </p>
                  </div>

                  <button
                    className="bbm-form-submit"
                    type="submit"
                    data-bbm-tour="scheduler-save-availability"
                    disabled={availabilityState.status === 'saving' || isAvailabilitySaved}
                  >
                    {availabilityState.status === 'saving' ? 'Saving…' : isAvailabilitySaved ? 'Saved' : 'Save availability'}
                  </button>
                </form>

                <hr style={{ margin: '28px 0', border: 'none', borderTop: '1px solid rgba(247, 200, 115, 0.22)' }} />

                <form data-bbm-tour="scheduler-invite" onSubmit={handleCreateInvite} className="bbm-contact-form">
                  <h3 className="bbm-contact-subtitle" style={{ textAlign: 'center' }}>Guest invite link</h3>

                  <div data-bbm-tour="scheduler-invite-fields" className="bbm-form-row bbm-form-row-3">
                    <label className="bbm-form-label">
                      Guest name
                      <input
                        className="bbm-form-input"
                        value={inviteName}
                        onChange={(e) => setInviteName(e.target.value)}
                        placeholder="Guest name"
                        required
                      />
                    </label>

                    <label className="bbm-form-label">
                      Guest email
                      <input
                        className="bbm-form-input"
                        value={inviteEmail}
                        onChange={(e) => setInviteEmail(e.target.value)}
                        placeholder="guest@example.com"
                        required
                      />
                    </label>

                    <label className="bbm-form-label">
                      Expires in (days)
                      <input
                        className="bbm-form-input"
                        type="number"
                        min={1}
                        max={365}
                        value={inviteDays}
                        onChange={(e) => setInviteDays(e.target.value)}
                        required
                      />
                    </label>
                  </div>

                  <button className="bbm-form-submit" type="submit" disabled={inviteState.status === 'loading'}>
                    {inviteState.status === 'loading' ? 'Generating…' : 'Generate link'}
                  </button>

                  {inviteState.status === 'ready' && (
                    <div>
                      <label className="bbm-form-label">
                        Invite URL
                        <input
                          className="bbm-form-input"
                          readOnly
                          value={inviteState.data.inviteUrl}
                          onFocus={(e) => e.target.select()}
                        />
                      </label>
                    </div>
                  )}
                </form>
              </>
            ) : (
              <MailBlastPanel sessionEmail={sessionState.email} />
            )}
          </div>
        )}
      </section>

      {tour.active && activeStep && tourTargetRect ? (
        <>
          <div
            className="bbm-tour-highlight bbm-tour-animate"
            style={{
              top: tourTargetRect.top,
              left: tourTargetRect.left,
              width: tourTargetRect.width,
              height: tourTargetRect.height,
              borderRadius: tourTargetRect.borderRadius,
            }}
          />

          <div
            ref={tourTooltipRef}
            className="bbm-tour-tooltip bbm-tour-animate"
            data-placement={tourPlacement}
            style={{ top: tourTooltipPos.top, left: tourTooltipPos.left }}
          >
            <button
              className="bbm-tour-close"
              type="button"
              onPointerDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                stopTour();
              }}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                stopTour();
              }}
              aria-label="Close tour"
            >
              ×
            </button>
            <div className="bbm-tour-step">
              Step {Math.min(activeTourSteps.length, tour.step + 1)} of {activeTourSteps.length}
            </div>
            <div className="bbm-tour-title">{activeStep.title}</div>
            <div className="bbm-tour-body">{activeStep.body}</div>

            <div className="bbm-tour-actions">
              <button className="bbm-tour-btn" type="button" onClick={prevTourStep} disabled={tour.step === 0}>
                Back
              </button>
              <button className="bbm-tour-btn bbm-tour-btn-primary" type="button" onClick={nextTourStep}>
                {tour.step >= activeTourSteps.length - 1 ? 'Done' : 'Next'}
              </button>
            </div>

            <span className="bbm-tour-arrow" aria-hidden="true" />
          </div>
        </>
      ) : tour.active && activeStep ? (
        <div className="bbm-tour-tooltip bbm-tour-animate" style={{ top: 80, left: 16 }}>
          <button
            className="bbm-tour-close"
            type="button"
            onPointerDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              stopTour();
            }}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              stopTour();
            }}
            aria-label="Close tour"
          >
            ×
          </button>
          <div className="bbm-tour-title">{activeStep.title}</div>
          <div className="bbm-tour-body">Scroll a bit — I’m looking for the next part of the page…</div>
        </div>
      ) : null}
    </AdminShell>
  );
}
