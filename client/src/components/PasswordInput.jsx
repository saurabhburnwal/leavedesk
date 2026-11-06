import { useState } from 'react';

/** Password field with a show/hide ("eye") toggle. Passes other props through to <input>. */
export function PasswordInput({ id, ...props }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="password-input">
      <input id={id} type={visible ? 'text' : 'password'} {...props} />
      <button
        type="button"
        className="password-toggle"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? 'Hide password' : 'Show password'}
        aria-pressed={visible}
        aria-controls={id}
        title={visible ? 'Hide password' : 'Show password'}
      >
        {visible ? (
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
            <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
            <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
            <line x1="1" y1="1" x2="23" y2="23" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        )}
      </button>
    </div>
  );
}

/** Live checklist that mirrors the server's password rules. */
export function PasswordRules({ value }) {
  const rules = [
    { ok: value.length >= 8, label: 'At least 8 characters' },
    { ok: /[A-Za-z]/.test(value), label: 'A letter' },
    { ok: /\d/.test(value), label: 'A number' },
  ];
  return (
    <ul className="pw-rules" aria-label="Password requirements">
      {rules.map((r) => (
        <li key={r.label} className={r.ok ? 'ok' : ''}>
          <span aria-hidden="true">{r.ok ? '✓' : '○'}</span> {r.label}
        </li>
      ))}
    </ul>
  );
}
