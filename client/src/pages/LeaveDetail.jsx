import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Api, ApiError } from '../api.js';
import { useApi, useAuth, usePolicy, useToast } from '../context.jsx';
import { Avatar, ErrorState, Field, LeaveTypeTag, Modal, PageHeader, Spinner, StatusBadge } from '../components/ui.jsx';
import { ApprovalProgress, DocumentList, Timeline } from '../components/LeaveDetailParts.jsx';
import { FileInput } from '../components/FileInput.jsx';
import { formatDate, formatDateTime, formatLeaveDays, isApproverRole, pluralize, STAGE_LABEL } from '../utils.js';

export function LeaveDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const { data, error, loading, reload, setData } = useApi(() => Api.leave(id), [id]);

  if (loading && !data) return <Spinner />;
  if (error) {
    return (
      <>
        <BackLink user={user} />
        <ErrorState error={error} onRetry={error.status === 404 ? undefined : reload} />
      </>
    );
  }

  const leave = data.leave;
  const isOwner = leave.employeeId === user.id;
  const p = leave.permissions;
  const update = (next) => setData({ leave: next });

  return (
    <>
      <PageHeader
        back={<BackLink user={user} isOwner={isOwner} />}
        title={
          <span className="title-with-badge">
            Request #{leave.id} <StatusBadge status={leave.status} stage={leave.currentStage} size="lg" />
          </span>
        }
        subtitle={isOwner ? `Submitted ${formatDateTime(leave.createdAt)}` : `${leave.employeeName} · ${leave.department}`}
        actions={
          <>
            {leave.status === 'APPROVED' && (
              <a className="btn btn-secondary" href={`/api/leaves/${leave.id}/calendar.ics`} title="Download an .ics file for Google, Outlook or Apple Calendar">
                📅 Add to calendar
              </a>
            )}
            {isOwner && <OwnerActions leave={leave} onChange={update} />}
          </>
        }
      />

      {leave.status === 'INFO_REQUESTED' && leave.infoRequest && (
        isOwner ? (
          <RespondPanel leave={leave} onDone={update} />
        ) : (
          <div className="alert alert-info">
            <span>
              <strong>{leave.infoRequest.actorName}</strong> asked for more information: “{leave.infoRequest.comment}”. Waiting for{' '}
              {leave.employeeName} to reply.
            </span>
          </div>
        )
      )}

      {p.canApprove && <DecisionPanel leave={leave} onDone={update} />}

      <div className="detail-grid">
        <div className="detail-main">
          <section className="card">
            <h2 className="card-title">Details</h2>
            <dl className="facts">
              {!isOwner && (
                <div>
                  <dt>Employee</dt>
                  <dd className="person">
                    <Avatar name={leave.employeeName} size="sm" /> {leave.employeeName}
                  </dd>
                </div>
              )}
              <div>
                <dt>Leave type</dt>
                <dd>
                  <LeaveTypeTag type={leave.leaveType} />
                </dd>
              </div>
              <div>
                <dt>From</dt>
                <dd>{formatDate(leave.fromDate, { weekday: true })}</dd>
              </div>
              <div>
                <dt>To</dt>
                <dd>{formatDate(leave.toDate, { weekday: true })}</dd>
              </div>
              <div>
                <dt>Working days</dt>
                <dd>
                  <strong>{formatLeaveDays(leave)}</strong>
                  {leave.requiresDocuments && <span className="flag">2-level approval</span>}
                </dd>
              </div>
              <div>
                <dt>Last updated</dt>
                <dd>{formatDateTime(leave.updatedAt)}</dd>
              </div>
              <div className="span-all">
                <dt>Reason</dt>
                <dd className="reason">{leave.reason}</dd>
              </div>
            </dl>
          </section>

          <DocumentsSection leave={leave} onChange={update} />

          <section className="card">
            <h2 className="card-title">History</h2>
            <Timeline items={leave.timeline} />
          </section>
        </div>

        <aside className="detail-side">
          <section className="card">
            <h2 className="card-title">Approval progress</h2>
            <ApprovalProgress leave={leave} />
            {leave.requiresDocuments && (
              <p className="muted small">
                More than 3 working days, so this request needs a supporting document and approval from both the Manager and the HOD.
              </p>
            )}
            {!isOwner && leave.employeeBalances && <EmployeeBalances balances={leave.employeeBalances} />}
          </section>
        </aside>
      </div>
    </>
  );
}

function EmployeeBalances({ balances }) {
  return (
    <div className="employee-balances">
      <h3 className="mini-title">{balances.year} leave balance</h3>
      {Object.entries(balances.byType).map(([type, balance]) => (
        <p key={type}><strong>{type}</strong>: {balance.used} used · {balance.available === null ? 'unlimited' : `${balance.available} available`}{balance.pending ? ` · ${balance.pending} pending` : ''}</p>
      ))}
    </div>
  );
}

function BackLink({ user, isOwner = true }) {
  const to = isOwner || !isApproverRole(user.role) ? '/leaves' : '/approvals';
  return (
    <Link to={to} className="back-link">
      ← {to === '/leaves' ? 'My leaves' : 'Approvals'}
    </Link>
  );
}

/** Approve / Reject / Ask for info, with a comment box. */
function DecisionPanel({ leave, onDone }) {
  const toast = useToast();
  const policy = usePolicy();
  const [comment, setComment] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  async function decide(kind) {
    const needsComment = kind !== 'approve';
    if (needsComment && comment.trim().length < policy.COMMENT_MIN) {
      setError(kind === 'reject' ? 'Please add a comment explaining why you are rejecting this request.' : 'Please describe what information you need.');
      return;
    }
    setError('');
    setBusy(kind);
    try {
      const call = { approve: Api.approve, reject: Api.reject, info: Api.requestInfo }[kind];
      const { leave: next } = await call(leave.id, comment.trim());
      const messages = {
        approve:
          next.status === 'APPROVED' ? `Request #${leave.id} approved.` : `Approved at manager level. Forwarded to ${next.hodApprover?.name} (HOD).`,
        reject: `Request #${leave.id} rejected.`,
        info: `Asked ${leave.employeeName} for more information.`,
      };
      toast.success(messages[kind]);
      setComment('');
      onDone(next);
    } catch (err) {
      setError(err.fields?.comment ?? '');
      toast.error(err.message);
    } finally {
      setBusy('');
    }
  }

  const stage = STAGE_LABEL[leave.currentStage];
  const docsMissing = leave.requiresDocuments && leave.documents.length === 0;

  return (
    <section className="card decision-card" aria-labelledby="decision-heading">
      <div className="card-head">
        <h2 id="decision-heading">Your decision ({stage} level)</h2>
        {leave.currentStage === 'MANAGER' && leave.hodApprover && <span className="muted small">After you approve, it goes to {leave.hodApprover.name} (HOD).</span>}
      </div>
      {leave.requiresDocuments && (
        <p className={`small ${docsMissing ? 'text-danger' : 'muted'}`}>
          {docsMissing
            ? 'No supporting document is attached. Consider asking for more information.'
            : `Review the ${pluralize(leave.documents.length, 'attached document')} below before deciding.`}
        </p>
      )}
      <Field label="Comment" htmlFor="decision-comment" error={error} hint="Required when rejecting or asking for information. Visible to the employee.">
        <textarea
          id="decision-comment"
          rows={3}
          maxLength={policy.COMMENT_MAX}
          value={comment}
          placeholder="Add a note for the employee…"
          onChange={(e) => {
            setComment(e.target.value);
            setError('');
          }}
        />
      </Field>
      <div className="decision-actions">
        <button className="btn btn-success" onClick={() => decide('approve')} disabled={!!busy}>
          {busy === 'approve' ? 'Approving…' : '✓ Approve'}
        </button>
        <button className="btn btn-danger" onClick={() => decide('reject')} disabled={!!busy}>
          {busy === 'reject' ? 'Rejecting…' : '✕ Reject'}
        </button>
        <button className="btn btn-secondary" onClick={() => decide('info')} disabled={!!busy}>
          {busy === 'info' ? 'Sending…' : '? Ask for more info'}
        </button>
      </div>
    </section>
  );
}

/** Shown to the employee when their approver asked a question. */
function RespondPanel({ leave, onDone }) {
  const toast = useToast();
  const [comment, setComment] = useState('');
  const [files, setFiles] = useState([]);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (comment.trim().length < 3) {
      setErrors({ comment: 'Please write a short reply for your approver.' });
      return;
    }
    const form = new FormData();
    form.append('comment', comment.trim());
    files.forEach((f) => form.append('documents', f));
    setBusy(true);
    try {
      const { leave: next } = await Api.respond(leave.id, form);
      toast.success('Reply sent. Your request is back with the approver.');
      onDone(next);
    } catch (err) {
      setErrors(err instanceof ApiError ? err.fields : {});
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card respond-card" onSubmit={submit} noValidate>
      <div className="callout callout-info">
        <strong>{leave.infoRequest.actorName} needs more information</strong>
        <p>“{leave.infoRequest.comment}”</p>
        <span className="muted small">{formatDateTime(leave.infoRequest.createdAt)}</span>
      </div>
      <Field label="Your reply" htmlFor="reply" error={errors.comment} required>
        <textarea id="reply" rows={3} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Answer the question or explain the attached files…" />
      </Field>
      <FileInput files={files} onChange={setFiles} error={errors.documents} label="Attach documents (optional)" />
      <div className="form-actions">
        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? 'Sending…' : 'Send reply'}
        </button>
      </div>
    </form>
  );
}

function DocumentsSection({ leave, onChange }) {
  const toast = useToast();
  const [files, setFiles] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const canAdd = leave.permissions.canAddDocuments && leave.status !== 'INFO_REQUESTED';

  async function upload() {
    if (!files.length) {
      setError('Please choose at least one file.');
      return;
    }
    const form = new FormData();
    files.forEach((f) => form.append('documents', f));
    setBusy(true);
    try {
      const { leave: next } = await Api.addDocuments(leave.id, form);
      toast.success(`${pluralize(files.length, 'document')} uploaded.`);
      setFiles([]);
      setError('');
      onChange(next);
    } catch (err) {
      setError(err.fields?.documents ?? err.message);
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <div className="card-head">
        <h2 className="card-title">Documents</h2>
        {leave.requiresDocuments && <span className="flag">Required for this request</span>}
      </div>
      {leave.documents.length ? <DocumentList documents={leave.documents} /> : <p className="muted">No documents attached.</p>}
      {canAdd && (
        <div className="add-docs">
          <FileInput files={files} onChange={setFiles} error={error} label="Add documents" />
          {files.length > 0 && (
            <button className="btn btn-secondary" onClick={upload} disabled={busy}>
              {busy ? 'Uploading…' : `Upload ${pluralize(files.length, 'file')}`}
            </button>
          )}
        </div>
      )}
    </section>
  );
}

function OwnerActions({ leave, onChange }) {
  const toast = useToast();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const p = leave.permissions;
  if (!p.canEdit && !p.canCancel) return null;

  async function cancel() {
    setBusy(true);
    try {
      const { leave: next } = await Api.cancelLeave(leave.id, reason.trim());
      toast.success(`Request #${leave.id} cancelled.`);
      setOpen(false);
      onChange(next);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {p.canEdit && (
        <button className="btn btn-secondary" onClick={() => navigate(`/leaves/${leave.id}/edit`)}>
          ✎ Edit
        </button>
      )}
      {p.canCancel && (
        <button className="btn btn-danger-outline" onClick={() => setOpen(true)}>
          Cancel request
        </button>
      )}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={`Cancel request #${leave.id}?`}
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setOpen(false)} disabled={busy}>
              Keep it
            </button>
            <button className="btn btn-danger" onClick={cancel} disabled={busy}>
              {busy ? 'Cancelling…' : 'Yes, cancel'}
            </button>
          </>
        }
      >
        <p>
          {leave.status === 'APPROVED'
            ? 'This leave is already approved. Cancelling it lets your manager know you will be working on these days.'
            : 'Your approvers will no longer see this request. This cannot be undone.'}
        </p>
        <Field label="Reason (optional)" htmlFor="cancel-reason">
          <textarea id="cancel-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
      </Modal>
    </>
  );
}
