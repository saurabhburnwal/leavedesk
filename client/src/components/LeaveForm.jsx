import { useEffect, useMemo, useState } from 'react';
import { ApiError } from '../api.js';
import { useAuth, usePolicy, useToast } from '../context.jsx';
import { LEAVE_TYPE_META, addDays, countWorkingDays, daysBetween, formatRange, parseIsoDate, pluralize, todayIso } from '../utils.js';
import { listHolidays } from '../api/holidays.js';
import { getLeaveBalances } from '../api/leavePolicy.js';
import { Field } from './ui.jsx';
import { FileInput } from './FileInput.jsx';

const EMPTY = { leaveType: 'CASUAL', dayPart: 'FULL', fromDate: '', toDate: '', reason: '' };

/**
 * Shared form for applying and editing. Validates as the user types (after a
 * field is touched), shows working days live and explains the approval route.
 */
export function LeaveForm({ initial = EMPTY, existingDocumentCount = 0, existingLeave = null, submitLabel, onSubmit, onCancel }) {
  const policy = usePolicy();
  const { user } = useAuth();
  const toast = useToast();
  const [values, setValues] = useState({ ...EMPTY, ...initial });
  const [files, setFiles] = useState([]);
  const [touched, setTouched] = useState({});
  const [serverErrors, setServerErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [holidays, setHolidays] = useState([]);
  const [balances, setBalances] = useState(null);

  useEffect(() => {
    listHolidays().then(setHolidays).catch(() => {});
    getLeaveBalances().then(setBalances).catch(() => {});
  }, []);

  const today = todayIso();
  const minDate = addDays(today, -policy.MAX_BACKDATE_DAYS);
  const maxDate = addDays(today, policy.MAX_ADVANCE_DAYS);

  const fullWorkingDays = countWorkingDays(values.fromDate, values.toDate, holidays.map((h) => h.date));
  const workingDays = values.dayPart === 'FULL' ? fullWorkingDays : fullWorkingDays > 0 && values.fromDate === values.toDate ? 0.5 : 0;
  const isLong = workingDays > policy.LONG_LEAVE_THRESHOLD_DAYS;
  const totalDocs = existingDocumentCount + files.length;
  const currentTypeBalance = balances?.byType?.[values.leaveType];
  const balanceCredit = existingLeave && existingLeave.leaveType === values.leaveType && existingLeave.status !== 'APPROVED'
    && existingLeave.fromDate.slice(0, 4) === values.fromDate.slice(0, 4) ? existingLeave.workingDays : 0;
  const effectiveAvailable = currentTypeBalance?.available === null ? null : (currentTypeBalance ? currentTypeBalance.available + balanceCredit : null);

  const errors = useMemo(
    () => validate(values, { policy, workingDays, isLong, totalDocs, minDate, maxDate, effectiveAvailable }),
    [values, policy, workingDays, isLong, totalDocs, minDate, maxDate, effectiveAvailable],
  );

  const set = (name) => (e) => {
    const value = e.target.value;
    setValues((v) => {
      const next = { ...v, [name]: value };
      // Convenience: picking a start date after the end date moves the end date along.
      if (name === 'fromDate' && value && (!v.toDate || v.toDate < value)) next.toDate = value;
      return next;
    });
    setServerErrors((s) => ({ ...s, [name]: undefined }));
  };
  const blur = (name) => () => setTouched((t) => ({ ...t, [name]: true }));
  const errorFor = (name) => serverErrors[name] || (touched[name] ? errors[name] : undefined);

  async function handleSubmit(e) {
    e.preventDefault();
    setTouched({ leaveType: true, fromDate: true, toDate: true, reason: true, documents: true });
    if (Object.keys(errors).length) {
      toast.error('Please fix the highlighted fields.');
      return;
    }
    const form = new FormData();
    Object.entries(values).forEach(([k, v]) => form.append(k, v));
    files.forEach((f) => form.append('documents', f));

    setSubmitting(true);
    try {
      await onSubmit(form);
    } catch (err) {
      if (err instanceof ApiError) {
        setServerErrors(err.fields ?? {});
        toast.error(err.message);
      } else {
        toast.error('Something went wrong. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  const reasonLength = values.reason.trim().length;
  // When your reporting manager is the HOD, one HOD approval covers both levels (mirrors the server).
  const isManagerApplying = !!user?.managerId && user.managerId === user.hodId;

  return (
    <form className="leave-form" onSubmit={handleSubmit} noValidate>
      <div className="form-grid">
        <div className="card form-card">
          <Field label="Leave type" htmlFor="leaveType" error={errorFor('leaveType')} required>
            <div className="segmented" role="radiogroup" aria-label="Leave type">
              {policy.leaveTypes.map((type) => (
                <label key={type} className={`segment type-${type.toLowerCase()} ${values.leaveType === type ? 'active' : ''}`}>
                  <input type="radio" name="leaveType" value={type} checked={values.leaveType === type} onChange={set('leaveType')} />
                  <span>{LEAVE_TYPE_META[type]?.short ?? type}</span>
                  {balances?.byType?.[type] && <small className="balance-chip">{balances.byType[type].available === null ? 'Unlimited' : `${balances.byType[type].available} days left`}</small>}
                </label>
              ))}
            </div>
          </Field>

          <Field label="Part of day" htmlFor="dayPart" error={errorFor('dayPart')}>
            <select id="dayPart" value={values.dayPart} onChange={set('dayPart')}>
              <option value="FULL">Full day</option>
              <option value="FIRST_HALF">First half</option>
              <option value="SECOND_HALF">Second half</option>
            </select>
          </Field>

          <div className="row-2">
            <Field label="From" htmlFor="fromDate" error={errorFor('fromDate')} required>
              <input
                id="fromDate"
                type="date"
                value={values.fromDate}
                min={minDate}
                max={maxDate}
                onChange={set('fromDate')}
                onBlur={blur('fromDate')}
                aria-invalid={!!errorFor('fromDate')}
              />
            </Field>
            <Field label="To" htmlFor="toDate" error={errorFor('toDate')} required>
              <input
                id="toDate"
                type="date"
                value={values.toDate}
                min={values.fromDate || minDate}
                max={maxDate}
                onChange={set('toDate')}
                onBlur={blur('toDate')}
                aria-invalid={!!errorFor('toDate')}
              />
            </Field>
          </div>

          <Field
            label="Reason"
            htmlFor="reason"
            error={errorFor('reason')}
            required
            hint={`${reasonLength}/${policy.REASON_MAX} characters`}
          >
            <textarea
              id="reason"
              rows={4}
              maxLength={policy.REASON_MAX}
              placeholder="e.g. Family function, medical appointment, vacation…"
              value={values.reason}
              onChange={set('reason')}
              onBlur={blur('reason')}
              aria-invalid={!!errorFor('reason')}
            />
          </Field>

          <FileInput
            files={files}
            onChange={(next) => {
              setFiles(next);
              setServerErrors((s) => ({ ...s, documents: undefined }));
            }}
            error={serverErrors.documents || (touched.documents || files.length ? errors.documents : undefined)}
            required={isLong && existingDocumentCount === 0}
            label={existingDocumentCount ? `Add more documents (${existingDocumentCount} already attached)` : 'Supporting documents'}
          />
        </div>

        <aside className="card summary-card" aria-live="polite">
          <h3>Summary</h3>
          {workingDays > 0 ? (
            <>
              <p className="summary-days">
                <span className="big">{workingDays}</span> {workingDays === 0.5 ? `day · ${values.dayPart === 'FIRST_HALF' ? 'first half' : 'second half'}` : `working ${workingDays === 1 ? 'day' : 'days'}`}
              </p>
              <p className="muted small">{formatRange(values.fromDate, values.toDate)} · weekends and public holidays excluded</p>
            </>
          ) : (
            <p className="muted">Pick your dates to see how many working days this covers.</p>
          )}

          {isLong ? (
            <div className="callout callout-warn">
              <strong>Long leave (more than {pluralize(policy.LONG_LEAVE_THRESHOLD_DAYS, 'working day')})</strong>
              <ul>
                <li>A supporting document is required.</li>
                <li>Needs approval from {isManagerApplying ? 'the HOD' : 'your Manager and then the HOD'}.</li>
              </ul>
            </div>
          ) : workingDays > 0 ? (
            <div className="callout callout-ok">Only your reporting manager's approval is needed.</div>
          ) : null}

          <h4>Approval route</h4>
          <ol className="route">
            {!(isLong && isManagerApplying) && (
              <li>
                <span className="route-step">1</span> {user?.managerName ?? 'Reporting manager'} <span className="muted small">(Manager)</span>
              </li>
            )}
            {isLong && (
              <li>
                <span className="route-step">{isManagerApplying ? 1 : 2}</span> {user?.hodName ?? 'Head of Department'}{' '}
                <span className="muted small">(HOD)</span>
              </li>
            )}
          </ol>
        </aside>
      </div>

      <div className="form-actions">
        {onCancel && (
          <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={submitting}>
            Cancel
          </button>
        )}
        <button type="submit" className="btn btn-primary" disabled={submitting}>
          {submitting ? 'Saving…' : submitLabel}
        </button>
      </div>
    </form>
  );
}

/** Client-side validation mirrors the server rules for instant feedback. */
function validate(values, { policy, workingDays, isLong, totalDocs, minDate, maxDate, effectiveAvailable }) {
  const errors = {};
  if (!policy.leaveTypes.includes(values.leaveType)) errors.leaveType = 'Please choose a leave type.';

  const from = parseIsoDate(values.fromDate);
  const to = parseIsoDate(values.toDate);
  if (!values.fromDate) errors.fromDate = 'Start date is required.';
  else if (!from) errors.fromDate = 'Pick a valid start date.';
  else if (values.fromDate < minDate) errors.fromDate = `Leave can be backdated by at most ${policy.MAX_BACKDATE_DAYS} days.`;

  if (!values.toDate) errors.toDate = 'End date is required.';
  else if (!to) errors.toDate = 'Pick a valid end date.';
  else if (from && to < from) errors.toDate = "End date can't be before the start date.";
  else if (values.toDate > maxDate) errors.toDate = 'You can plan leave up to one year in advance.';
  else if (from && daysBetween(values.fromDate, values.toDate) + 1 > policy.MAX_SPAN_CALENDAR_DAYS)
    errors.toDate = `A single request can cover at most ${policy.MAX_SPAN_CALENDAR_DAYS} days.`;
  else if (from && values.dayPart !== 'FULL' && values.fromDate !== values.toDate) errors.toDate = 'Half-day leave can only be requested for a single date.';
  else if (from && workingDays === 0) errors.toDate = 'These dates fall entirely on weekends or public holidays, so no leave is needed.';

  const reason = values.reason.trim();
  if (!reason) errors.reason = 'Please tell us the reason for your leave.';
  else if (reason.length < policy.REASON_MIN) errors.reason = `Reason should be at least ${policy.REASON_MIN} characters.`;

  if (isLong && totalDocs === 0) {
    errors.documents = `This leave is ${workingDays} working days. Please attach a supporting document (e.g. medical certificate or travel booking).`;
  }
  if (effectiveAvailable !== null && effectiveAvailable !== undefined && workingDays > effectiveAvailable) {
    errors.leaveType = `Only ${effectiveAvailable} ${values.leaveType.toLowerCase()} leave days are available this year.`;
  }
  return errors;
}
