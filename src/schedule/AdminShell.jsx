import React from 'react';

import './Admin.css';

export default function AdminShell({ children, email = null, headerActions = null, onLogout = null }) {
  return (
    <div className="admin-shell">
      <header className="admin-topbar">
        <div className="admin-brand">
          <div className="admin-brand-mark" aria-hidden="true">BB</div>
          <div>
            <strong>Black Bridge Mindset</strong>
            <span>Admin dashboard</span>
          </div>
        </div>

        <div className="admin-topbar-actions">
          {headerActions}
          {email ? <span className="admin-user-email">{email}</span> : null}
          {typeof onLogout === 'function' ? (
            <button className="admin-signout-button" type="button" onClick={onLogout}>
              Sign out
            </button>
          ) : null}
        </div>
      </header>

      <main className="admin-main">{children}</main>
    </div>
  );
}
