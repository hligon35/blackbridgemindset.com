import React, { useCallback, useEffect, useState } from 'react';

import AdminLoginPage from './AdminLoginPage';
import AdminShell from './AdminShell';
import ScheduleAdminPage from './ScheduleAdminPage';
import { adminGetSession } from './utils/adminApi';

export default function AdminPage() {
  useEffect(() => {
    document.title = 'Admin | Black Bridge Mindset';
  }, []);

  const [sessionState, setSessionState] = useState({ status: 'loading', email: null });

  const refreshSession = useCallback(async () => {
    const res = await adminGetSession();
    if (res.ok && res.data?.ok) {
      setSessionState({ status: 'ready', email: res.data.email || null });
      return true;
    }

    setSessionState({ status: 'unauthorized', email: null });
    return false;
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const res = await adminGetSession();
      if (cancelled) return;

      if (res.ok && res.data?.ok) {
        setSessionState({ status: 'ready', email: res.data.email || null });
      } else {
        setSessionState({ status: 'unauthorized', email: null });
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (sessionState.status === 'loading') {
    return (
      <AdminShell>
        <section className="admin-panel admin-loading-panel">
          <p>Checking session…</p>
        </section>
      </AdminShell>
    );
  }

  if (sessionState.status !== 'ready') {
    return <AdminLoginPage onSuccess={refreshSession} />;
  }

  return (
    <ScheduleAdminPage
      skipSessionCheck
      sessionEmail={sessionState.email}
      onUnauthorized={() => setSessionState({ status: 'unauthorized', email: null })}
      onLoggedOut={() => setSessionState({ status: 'unauthorized', email: null })}
    />
  );
}
