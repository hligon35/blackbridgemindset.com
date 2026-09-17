import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

const AdminToastContext = createContext(null);

function makeToastId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function AdminToastViewport({ toast, onClose, onUndo }) {
  if (!toast) return null;

  return (
    <div className="admin-toast-viewport" aria-live="polite" aria-atomic="true">
      <div className={`admin-toast admin-toast-${toast.tone || 'success'}`} role="status">
        <span className="admin-toast-message">{toast.message}</span>
        <div className="admin-toast-actions">
          {typeof toast.onUndo === 'function' ? (
            <button className="admin-toast-button admin-toast-undo" type="button" onClick={onUndo}>
              Undo
            </button>
          ) : null}
          <button className="admin-toast-button admin-toast-close" type="button" onClick={onClose} aria-label="Close notification">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export function AdminToastProvider({ children }) {
  const [toast, setToast] = useState(null);
  const timerRef = useRef(null);

  const closeToast = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    setToast(null);
  }, []);

  const notify = useCallback(
    ({ message, tone = 'success', onUndo } = {}) => {
      const cleanMessage = String(message || '').trim();
      if (!cleanMessage) return;

      if (timerRef.current) clearTimeout(timerRef.current);
      const id = makeToastId();
      setToast({ id, message: cleanMessage, tone, onUndo });
      timerRef.current = setTimeout(() => {
        setToast((current) => (current?.id === id ? null : current));
        timerRef.current = null;
      }, 5000);
    },
    []
  );

  const undoToast = useCallback(async () => {
    const current = toast;
    closeToast();
    if (typeof current?.onUndo !== 'function') return;

    try {
      await current.onUndo();
    } catch (error) {
      notify({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Unable to undo that action.',
      });
    }
  }, [closeToast, notify, toast]);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  const value = useMemo(() => ({ notify, closeToast }), [closeToast, notify]);

  return (
    <AdminToastContext.Provider value={value}>
      {children}
      <AdminToastViewport toast={toast} onClose={closeToast} onUndo={undoToast} />
    </AdminToastContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAdminToast() {
  const context = useContext(AdminToastContext);
  if (!context) throw new Error('useAdminToast must be used inside AdminToastProvider');
  return context;
}
