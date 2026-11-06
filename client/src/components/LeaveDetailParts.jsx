import { documentUrl } from '../api.js';
import { formatBytes, formatDateTime, ROLE_LABEL, STAGE_LABEL } from '../utils.js';

/** Works out each approval level's state from the timeline (only since the last submit/edit). */
function stageState(leave, stage, relevant) {
  if (relevant.some((a) => a.action === 'APPROVED' && a.stage === stage)) return 'done';
  if (relevant.some((a) => a.action === 'REJECTED' && a.stage === stage)) return 'rejected';
  if (leave.currentStage === stage && leave.status === 'PENDING') return 'current';
  if (leave.currentStage === stage && leave.status === 'INFO_REQUESTED') return 'info';
  if (leave.status === 'CANCELLED' || leave.status === 'REJECTED') return 'skipped';
  return 'upcoming';
}

const STATE_TEXT = {
  done: 'Approved',
  rejected: 'Rejected',
  current: 'Awaiting decision',
  info: 'Waiting for employee',
  skipped: 'Not needed',
  upcoming: 'Up next',
};

/** Visual stepper: Submitted -> Manager -> (HOD) -> Final. */
export function ApprovalProgress({ leave }) {
  const lastReset = leave.timeline.findLastIndex((a) => a.action === 'SUBMITTED' || a.action === 'UPDATED');
  const relevant = leave.timeline.slice(lastReset + 1);

  const steps = [{ key: 'submitted', title: 'Submitted', who: leave.employeeName, state: 'done', text: formatDateTime(leave.createdAt) }];
  if (leave.managerApprover) {
    const state = stageState(leave, 'MANAGER', relevant);
    steps.push({ key: 'manager', title: 'Level 1 · Manager', who: leave.managerApprover.name, state, text: STATE_TEXT[state] });
  }
  if (leave.hodApprover) {
    const state = stageState(leave, 'HOD', relevant);
    steps.push({ key: 'hod', title: `Level ${leave.managerApprover ? 2 : 1} · HOD`, who: leave.hodApprover.name, state, text: STATE_TEXT[state] });
  }
  const finalState = { APPROVED: 'done', REJECTED: 'rejected', CANCELLED: 'skipped' }[leave.status] ?? 'upcoming';
  const finalTitle = { APPROVED: 'Approved', REJECTED: 'Rejected', CANCELLED: 'Cancelled' }[leave.status] ?? 'Final decision';
  steps.push({ key: 'final', title: finalTitle, who: '', state: finalState, text: finalState === 'upcoming' ? 'Pending' : '' });

  return (
    <ol className="stepper" aria-label="Approval progress">
      {steps.map((step) => (
        <li key={step.key} className={`step step-${step.state}`}>
          <span className="step-marker" aria-hidden="true">
            {step.state === 'done' ? '✓' : step.state === 'rejected' ? '✕' : step.state === 'info' ? '?' : ''}
          </span>
          <span className="step-title">{step.title}</span>
          {step.who && <span className="step-who">{step.who}</span>}
          {step.text && <span className="step-text">{step.text}</span>}
        </li>
      ))}
    </ol>
  );
}

const ACTION_META = {
  SUBMITTED: { label: 'submitted the request', tone: 'neutral', icon: '📝' },
  APPROVED: { label: 'approved', tone: 'approved', icon: '✓' },
  REJECTED: { label: 'rejected the request', tone: 'rejected', icon: '✕' },
  INFO_REQUESTED: { label: 'asked for more information', tone: 'info', icon: '?' },
  INFO_PROVIDED: { label: 'replied with more information', tone: 'neutral', icon: '↩' },
  UPDATED: { label: 'edited the request', tone: 'pending', icon: '✎' },
  CANCELLED: { label: 'cancelled the request', tone: 'cancelled', icon: '⦸' },
  DOCUMENTS_ADDED: { label: 'added documents', tone: 'neutral', icon: '📎' },
};

/** Chronological history of the request with every comment. */
export function Timeline({ items }) {
  return (
    <ol className="timeline">
      {items.map((item) => {
        const meta = ACTION_META[item.action] ?? { label: item.action, tone: 'neutral', icon: '•' };
        return (
          <li key={item.id} className={`timeline-item tone-${meta.tone}`}>
            <span className="timeline-icon" aria-hidden="true">
              {meta.icon}
            </span>
            <div className="timeline-body">
              <div className="timeline-head">
                <strong>{item.actor.name}</strong> <span className="muted small">({ROLE_LABEL[item.actor.role]})</span> {meta.label}
                {item.action === 'APPROVED' && item.stage && <> at {STAGE_LABEL[item.stage]} level</>}
              </div>
              {item.comment && <blockquote className="comment">{item.comment}</blockquote>}
              <time className="muted small" dateTime={item.createdAt}>
                {formatDateTime(item.createdAt)}
              </time>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

const FILE_ICON = { 'application/pdf': '📕', 'image/jpeg': '🖼️', 'image/png': '🖼️' };

export function DocumentList({ documents }) {
  return (
    <ul className="doc-list">
      {documents.map((doc) => (
        <li key={doc.id}>
          {doc.mimeType.startsWith('image/') ? (
            <img className="doc-thumb" src={documentUrl(doc.id)} alt="" loading="lazy" />
          ) : (
            <span className="doc-icon" aria-hidden="true">
              {FILE_ICON[doc.mimeType] ?? '📄'}
            </span>
          )}
          <div className="doc-info">
            <span className="doc-name">{doc.originalName}</span>
            <span className="muted small">
              {formatBytes(doc.sizeBytes)} · uploaded by {doc.uploadedBy.name} · {formatDateTime(doc.createdAt)}
            </span>
          </div>
          <div className="doc-actions">
            <a className="btn btn-sm btn-secondary" href={documentUrl(doc.id)} target="_blank" rel="noopener noreferrer">
              View
            </a>
            <a className="btn btn-sm btn-ghost" href={documentUrl(doc.id, true)}>
              Download
            </a>
          </div>
        </li>
      ))}
    </ul>
  );
}

