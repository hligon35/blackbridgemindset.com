import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { adminAuthStart, adminAuthVerify, adminGetAuthConfig, adminGetSession } from './utils/adminApi';
import AdminShell from './AdminShell';
import { useAdminToast } from './components/AdminToast';

function looksLikePhone(value) {
  const v = String(value || '').trim();
  if (!v) return false;
  if (v.startsWith('+')) return true;
  const digits = v.replace(/[^0-9]/g, '');
  const nonEmailCharsOnly = v.replace(/[0-9\s().-]/g, '') === '';
  return digits.length >= 8 && nonEmailCharsOnly;
}

function isValidEmail(value) {
  const v = String(value || '').trim();
  if (!v) return false;
  if (v.length > 120) return false;
  if (v.includes(' ')) return false;
  // Simple sanity check (not RFC-complete, but prevents phone-like inputs).
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

export default function AdminLoginPage({ onSuccess }) {
  useEffect(() => {
    document.title = 'Admin Login | Black Bridge Mindset';
  }, []);

  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');

  const [step, setStep] = useState('email'); // email | code
  const [status, setStatus] = useState('idle'); // idle | loading
  const [googleAuthEnabled, setGoogleAuthEnabled] = useState(false);
  const { notify, closeToast } = useAdminToast();

  useEffect(() => {
    let cancelled = false;
    adminGetAuthConfig().then((res) => {
      if (!cancelled && res.ok) setGoogleAuthEnabled(Boolean(res.data?.googleAuthEnabled));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function check() {
      const res = await adminGetSession();
      if (cancelled) return;
      if (res.ok && res.data?.ok) {
        if (typeof onSuccess === 'function') {
          await onSuccess();
        } else {
          navigate('/admin', { replace: true });
        }
      }
    }

    check();
    return () => {
      cancelled = true;
    };
  }, [navigate, onSuccess]);

  async function handleSendCode(e) {
    e.preventDefault();
    closeToast();

    const clean = email.trim();
    if (looksLikePhone(clean)) {
      notify({ tone: 'error', message: 'Email only. Please enter your email address.' });
      return;
    }

    if (!isValidEmail(clean)) {
      notify({ tone: 'error', message: 'Please enter a valid email address.' });
      return;
    }

    setStatus('loading');
    const res = await adminAuthStart({ email: clean });
    setStatus('idle');

    if (!res.ok) {
      notify({ tone: 'error', message: res.error || 'Failed to send code.' });
      return;
    }

    setStep('code');
    if (import.meta.env.DEV && res.data?.devCode) {
      notify({ message: `DEV MODE: Your code is ${res.data.devCode}` });
    } else {
      notify({ message: 'If your email is allowed, a code was sent.' });
    }
  }

  async function handleVerifyCode(e) {
    e.preventDefault();
    closeToast();

    const cleanEmail = email.trim();
    const cleanCode = code.trim();

    if (looksLikePhone(cleanEmail)) {
      notify({ tone: 'error', message: 'Email only. Please enter your email address.' });
      return;
    }

    if (!isValidEmail(cleanEmail)) {
      notify({ tone: 'error', message: 'Please enter a valid email address.' });
      return;
    }

    if (!cleanCode || cleanCode.length < 4) {
      notify({ tone: 'error', message: 'Please enter your code.' });
      return;
    }

    setStatus('loading');
    const res = await adminAuthVerify({ email: cleanEmail, code: cleanCode });
    setStatus('idle');

    if (!res.ok) {
      notify({ tone: 'error', message: res.error || 'Invalid code.' });
      return;
    }

    // Confirm the cookie-based session actually stuck before redirecting.
    const session = await adminGetSession();
    if (session.ok && session.data?.ok) {
      if (typeof onSuccess === 'function') {
        await onSuccess();
      } else {
        navigate('/admin', { replace: true });
      }
      return;
    }

    notify({
      tone: 'error',
      message: 'Login succeeded, but the session was not established. Make sure Vite and the Worker use the same hostname (localhost vs 127.0.0.1), then try again.',
    });
  }

  return (
    <AdminShell>
      <section className="admin-login-panel">
        <p className="admin-eyebrow">Private workspace</p>
        <h1>Admin login</h1>
        <p className="admin-login-copy">Sign in to manage submissions, scheduling, and community email.</p>

        {googleAuthEnabled ? (
          <div className="admin-google-access-card">
            <strong>Google account access</strong>
            <span>Use the authorized Google account connected through Cloudflare Access.</span>
            <button
              className="admin-primary-button admin-submit-button"
              type="button"
              onClick={() => {
                const returnTo = `${window.location.origin}/admin`;
                window.location.assign(`/cdn-cgi/access/login?returnTo=${encodeURIComponent(returnTo)}`);
              }}
            >
              Continue with Google
            </button>
          </div>
        ) : null}

        <form
          onSubmit={step === 'email' ? handleSendCode : handleVerifyCode}
          className="bbm-contact-form"
          style={{ maxWidth: 520, margin: '0 auto' }}
        >
          <h2 className="admin-form-heading">{googleAuthEnabled ? 'Email-code fallback' : 'Secure access'}</h2>
          {googleAuthEnabled ? <p className="admin-login-method-note">If Google Access is unavailable, use the one-time code below.</p> : null}

          <label className="admin-form-label">
            Email
            <input
              className="admin-form-input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => {
                if (e.isComposing) return;
                if (step !== 'email') return;
                if (e.key !== 'Enter') return;
                // Some browsers/mobile keyboards don't always trigger form submit here.
                handleSendCode(e);
              }}
              placeholder="you@example.com"
              autoComplete="email"
              inputMode="email"
              autoCapitalize="none"
              spellCheck={false}
              required
            />
          </label>

          {step === 'code' && (
            <label className="admin-form-label">
              Code
              <input
                className="admin-form-input"
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="123456"
                inputMode="numeric"
                autoComplete="one-time-code"
                autoFocus
                required
              />
            </label>
          )}

          <button className="admin-primary-button admin-submit-button" type="submit" disabled={status === 'loading'}>
            {status === 'loading' ? 'Working…' : step === 'email' ? 'Send code' : 'Verify code'}
          </button>

          {step === 'code' && (
            <button
              className="admin-secondary-button admin-submit-button"
              type="button"
              onClick={() => {
                setStep('email');
                setCode('');
                closeToast();
              }}
              disabled={status === 'loading'}
              style={{ marginTop: 10 }}
            >
              Back
            </button>
          )}
        </form>
      </section>
    </AdminShell>
  );
}
