import { useEffect, useRef } from 'react';
import { LEAVE_TYPE_META, STAGE_LABEL, STATUS_META, initials } from '../utils.js';

/** Color-coded status pill. Shows the approval level while pending. */
export function StatusBadge({ status, stage, size }) {
  const meta = STATUS_META[status] ?? { label: status, tone: 'cancelled' };
  const suffix = stage && (status === 'PENDING' || status === 'INFO_REQUESTED') ? ` · ${STAGE_LABEL[stage]}` : '';
  return (
    <span className={`badge badge-${meta.tone} ${size === 'lg' ? 'badge-lg' : ''}`}>
      <span className="badge-dot" aria-hidden="true" />
      {meta.label}
      {suffix}
    </span>
  );
}

export function LeaveTypeTag({ type, short = false }) {
  const meta = LEAVE_TYPE_META[type] ?? { label: type, short: type };
  return <span className={`type-tag type-${type?.toLowerCase()}`}>{short ? meta.short : meta.label}</span>;
}

export function Avatar({ name, size = 'md' }) {
  return (
    <span className={`avatar avatar-${size}`} aria-hidden="true">
      {initials(name)}
    </span>
  );
}

export function Spinner({ label = 'Loading…' }) {
  return (
    <div className="spinner-wrap" role="status">
      <span className="spinner" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

export function EmptyState({ icon = '🗂️', title, children, action }) {
  return (
    <div className="empty">
      <div className="empty-icon" aria-hidden="true">
        {icon}
      </div>
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ error, onRetry }) {
  return (
    <div className="alert alert-error" role="alert">
      <div>
        <strong>We couldn't load this.</strong> {error?.message}
      </div>
      {onRetry && (
        <button className="btn btn-sm btn-secondary" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions, back }) {
  return (
    <header className="page-header">
      <div>
        {back}
        <h1>{title}</h1>
        {subtitle && <p className="muted">{subtitle}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  );
}

export function Field({ label, htmlFor, error, hint, required, children }) {
  return (
    <div className={`field ${error ? 'field-invalid' : ''}`}>
      {label && (
        <label htmlFor={htmlFor}>
          {label}
          {required && <span className="required" aria-hidden="true"> *</span>}
        </label>
      )}
      {children}
      {error ? (
        <p className="field-error" id={htmlFor ? `${htmlFor}-error` : undefined} role="alert">
          {error}
        </p>
      ) : (
        hint && <p className="field-hint">{hint}</p>
      )}
    </div>
  );
}

/** Accessible modal built on the native <dialog> element. */
export function Modal({ open, title, onClose, children, footer }) {
  const ref = useRef(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog ref={ref} className="modal" onClose={onClose} onCancel={onClose}>
      <div className="modal-header">
        <h2>{title}</h2>
        <button className="icon-btn" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>
      <div className="modal-body">{children}</div>
      {footer && <div className="modal-footer">{footer}</div>}
    </dialog>
  );
}

export function StatCard({ label, value, tone = 'neutral', hint, onClick }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag className={`stat stat-${tone}`} onClick={onClick} type={onClick ? 'button' : undefined}>
      <span className="stat-value">{value}</span>
      <span className="stat-label">{label}</span>
      {hint && <span className="stat-hint">{hint}</span>}
    </Tag>
  );
}
