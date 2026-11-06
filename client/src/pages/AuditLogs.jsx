import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Api } from '../api.js';
import { EmptyState, ErrorState, PageHeader, Spinner, Avatar } from '../components/ui.jsx';
import { formatDate, formatDateTime, ROLE_LABEL, STAGE_LABEL } from '../utils.js';

const ACTION_TONE = {
  LOGIN_SUCCESS: 'neutral',
  LOGOUT: 'neutral',
  LOGIN_FAILED: 'rejected',
  LEAVE_SUBMITTED: 'pending',
  LEAVE_UPDATED: 'pending',
  LEAVE_APPROVED: 'approved',
  LEAVE_REJECTED: 'rejected',
  LEAVE_INFO_REQUESTED: 'info',
  LEAVE_INFO_PROVIDED: 'info',
  LEAVE_CANCELLED: 'cancelled',
  DOCUMENTS_UPLOADED: 'neutral',
  DOCUMENT_VIEWED: 'neutral',
};

const humanize = (action) => action.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase());

function describe(entry) {
  const d = entry.details ?? {};
  switch (entry.action) {
    case 'LEAVE_SUBMITTED':
      return `${formatDate(d.fromDate)} → ${formatDate(d.toDate)} · ${d.workingDays} working day(s)${d.longLeave ? ' · long leave' : ''}`;
    case 'LEAVE_APPROVED':
      return `${STAGE_LABEL[d.stage] ?? d.stage} level · ${d.outcome === 'FORWARDED_TO_HOD' ? 'forwarded to HOD' : 'final approval'}${d.comment ? ` · “${d.comment}”` : ''}`;
    case 'LEAVE_REJECTED':
    case 'LEAVE_INFO_REQUESTED':
    case 'LEAVE_INFO_PROVIDED':
    case 'LEAVE_CANCELLED':
      return d.comment ? `“${d.comment}”` : '';
    case 'LEAVE_UPDATED':
      return `${formatDate(d.before?.fromDate)} – ${formatDate(d.before?.toDate)} → ${formatDate(d.after?.fromDate)} – ${formatDate(d.after?.toDate)}`;
    case 'DOCUMENTS_UPLOADED':
      return (d.files ?? []).map((f) => f.name).join(', ');
    case 'DOCUMENT_VIEWED':
      return `${d.name} (request #${d.leaveId})`;
    case 'LOGIN_FAILED':
      return `Wrong password for ${entry.actor.email}`;
    default:
      return '';
  }
}

export function AuditLogsPage() {
  const [action, setAction] = useState('');
  const [state, setState] = useState({ items: [], actions: [], hasMore: false, loading: true, error: null });

  async function load(offset = 0) {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const res = await Api.auditLogs({ action, offset });
      setState((s) => ({
        items: offset ? [...s.items, ...res.items] : res.items,
        actions: res.actions,
        hasMore: res.hasMore,
        loading: false,
        error: null,
      }));
    } catch (error) {
      setState((s) => ({ ...s, loading: false, error }));
    }
  }

  useEffect(() => {
    load(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [action]);

  return (
    <>
      <PageHeader
        title="Audit log"
        subtitle="Every sign-in, workflow decision and document view in your department. Entries cannot be edited or deleted."
      />
      <div className="toolbar">
        <label className="inline-label" htmlFor="action-filter">
          Action
        </label>
        <select id="action-filter" value={action} onChange={(e) => setAction(e.target.value)}>
          <option value="">All actions</option>
          {state.actions.map((a) => (
            <option key={a} value={a}>
              {humanize(a)}
            </option>
          ))}
        </select>
      </div>

      {state.error && <ErrorState error={state.error} onRetry={() => load(0)} />}
      {!state.error && state.items.length === 0 && !state.loading && <EmptyState title="No audit entries">Nothing matches this filter.</EmptyState>}

      {state.items.length > 0 && (
        <div className="card flush">
          <div className="table-wrap">
            <table className="leave-table audit-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Who</th>
                  <th>Action</th>
                  <th>Target</th>
                  <th>Details</th>
                  <th>IP</th>
                </tr>
              </thead>
              <tbody>
                {state.items.map((e) => (
                  <tr key={e.id}>
                    <td data-label="When" className="nowrap">
                      {formatDateTime(e.createdAt)}
                    </td>
                    <td data-label="Who">
                      <span className="person">
                        <Avatar name={e.actor.name} size="sm" />
                        <span>
                          {e.actor.name}
                          <span className="muted small block">{ROLE_LABEL[e.actor.role]}</span>
                        </span>
                      </span>
                    </td>
                    <td data-label="Action">
                      <span className={`badge badge-${ACTION_TONE[e.action] ?? 'neutral'}`}>{humanize(e.action)}</span>
                    </td>
                    <td data-label="Target">
                      {e.entityType === 'LEAVE' ? (
                        <Link to={`/leaves/${e.entityId}`}>Leave #{e.entityId}</Link>
                      ) : e.entityType === 'DOCUMENT' ? (
                        `Document #${e.entityId}`
                      ) : (
                        <span className="muted">Account</span>
                      )}
                    </td>
                    <td data-label="Details" className="reason-cell">
                      {describe(e)}
                    </td>
                    <td data-label="IP" className="muted small">
                      {e.ipAddress}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {state.loading && <Spinner />}
      {state.hasMore && !state.loading && (
        <div className="center">
          <button className="btn btn-secondary" onClick={() => load(state.items.length)}>
            Load more
          </button>
        </div>
      )}
    </>
  );
}
