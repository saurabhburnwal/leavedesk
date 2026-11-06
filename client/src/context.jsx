import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Api, setUnauthorizedHandler } from './api.js';

// ------------------------------------------------------------------ toasts
const ToastContext = createContext(null);
let toastSeq = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback((id) => setToasts((list) => list.filter((t) => t.id !== id)), []);
  const push = useCallback(
    (type, message) => {
      const id = ++toastSeq;
      setToasts((list) => [...list.slice(-3), { id, type, message }]);
      setTimeout(() => dismiss(id), type === 'error' ? 7000 : 4000);
    },
    [dismiss],
  );

  const api = useMemo(
    () => ({
      success: (m) => push('success', m),
      error: (m) => push('error', m),
      info: (m) => push('info', m),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.type}`}>
            <span className="toast-icon" aria-hidden="true">
              {t.type === 'success' ? '✓' : t.type === 'error' ? '!' : 'i'}
            </span>
            <span>{t.message}</span>
            <button className="toast-close" onClick={() => dismiss(t.id)} aria-label="Dismiss">
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);

// -------------------------------------------------------------------- auth
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  // True after an explicit sign-out, so the next sign-in starts at the dashboard
  // instead of returning to the previous user's last page.
  const [signedOut, setSignedOut] = useState(false);
  const toast = useToast();
  const userRef = useRef(null);
  userRef.current = user;

  useEffect(() => {
    Api.me()
      .then((r) => setUser(r.user))
      .catch(() => setUser(null))
      .finally(() => setReady(true));

    setUnauthorizedHandler(() => {
      if (userRef.current) toast.info('Your session has expired. Please sign in again.');
      setUser(null);
    });
  }, [toast]);

  const value = useMemo(
    () => ({
      user,
      ready,
      signedOut,
      async login(email, password) {
        const { user: signedIn } = await Api.login(email, password);
        setSignedOut(false);
        setUser(signedIn);
        return signedIn;
      },
      /** Used after email verification, which signs the user in on the server. */
      completeSignIn(signedIn) {
        setSignedOut(false);
        setUser(signedIn);
      },
      async logout() {
        try {
          await Api.logout();
        } finally {
          setSignedOut(true);
          setUser(null);
        }
      },
    }),
    [user, ready, signedOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);

// ------------------------------------------------------------------ policy
const DEFAULT_POLICY = {
  LONG_LEAVE_THRESHOLD_DAYS: 3,
  MAX_SPAN_CALENDAR_DAYS: 60,
  MAX_BACKDATE_DAYS: 30,
  MAX_ADVANCE_DAYS: 365,
  REASON_MIN: 5,
  REASON_MAX: 500,
  COMMENT_MIN: 3,
  COMMENT_MAX: 1000,
  MAX_FILES_PER_UPLOAD: 5,
  MAX_FILE_SIZE_MB: 5,
  YEARLY_ALLOWANCES: { CASUAL: 12, SICK: 10, EARNED: 15, UNPAID: null },
  leaveTypes: ['CASUAL', 'SICK', 'EARNED', 'UNPAID'],
  allowedExtensions: ['.pdf', '.jpg', '.jpeg', '.png', '.doc', '.docx'],
};

const PolicyContext = createContext(DEFAULT_POLICY);

/** Business rules are loaded from the server (single source of truth). */
export function PolicyProvider({ children }) {
  const [policy, setPolicy] = useState(DEFAULT_POLICY);
  useEffect(() => {
    Api.policy()
      .then(setPolicy)
      .catch(() => {});
  }, []);
  return <PolicyContext.Provider value={policy}>{children}</PolicyContext.Provider>;
}

export const usePolicy = () => useContext(PolicyContext);

// ------------------------------------------------------------- data hook
/** Small data-fetching hook: { data, error, loading, reload, setData }. */
export function useApi(fetcher, deps = []) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let active = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    fetcher()
      .then((data) => active && setState({ data, error: null, loading: false }))
      .catch((error) => active && setState({ data: null, error, loading: false }));
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, version]);

  return {
    ...state,
    reload: () => setVersion((v) => v + 1),
    setData: (data) => setState({ data, error: null, loading: false }),
  };
}
