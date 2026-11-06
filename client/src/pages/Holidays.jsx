import { useMemo, useState } from 'react';
import { useApi, useAuth, useToast } from '../context.jsx';
import { ErrorState, Field, PageHeader, Spinner } from '../components/ui.jsx';
import { addHoliday, deleteHoliday, listHolidays } from '../api/holidays.js';
import { formatDate, todayIso } from '../utils.js';

/** Everyone can view public holidays; HODs can maintain the shared calendar. */
export function HolidaysPage() {
  const { user } = useAuth();
  const toast = useToast();
  const { data, error, loading, reload, setData } = useApi(listHolidays, []);
  const [date, setDate] = useState('');
  const [name, setName] = useState('');
  const [fieldError, setFieldError] = useState({});
  const [busy, setBusy] = useState(false);
  const today = todayIso();
  const items = useMemo(() => [...(data ?? [])].sort((a, b) => {
    const upcomingA = a.date >= today;
    const upcomingB = b.date >= today;
    return upcomingA === upcomingB ? a.date.localeCompare(b.date) : upcomingA ? -1 : 1;
  }), [data, today]);

  async function submit(event) {
    event.preventDefault();
    setFieldError({});
    setBusy(true);
    try {
      await addHoliday({ date, name });
      setDate(''); setName('');
      toast.success('Public holiday added.');
      reload();
    } catch (err) {
      setFieldError(err.fields ?? {});
      toast.error(err.message);
    } finally { setBusy(false); }
  }

  async function remove(holiday) {
    setBusy(true);
    try {
      await deleteHoliday(holiday.id);
      setData((data ?? []).filter((item) => item.id !== holiday.id));
      toast.success(`${holiday.name} removed from the calendar.`);
    } catch (err) { toast.error(err.message); }
    finally { setBusy(false); }
  }

  return (
    <>
      <PageHeader title="Public holidays" subtitle="Leave working days exclude weekends and these public holidays." />
      {user.role === 'HOD' && (
        <form className="card holiday-form" onSubmit={submit}>
          <h2 className="card-title">Add a public holiday</h2>
          <div className="row-2">
            <Field label="Date" htmlFor="holiday-date" error={fieldError.date} required>
              <input id="holiday-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
            </Field>
            <Field label="Holiday name" htmlFor="holiday-name" error={fieldError.name} required>
              <input id="holiday-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} placeholder="e.g. Republic Day" required />
            </Field>
          </div>
          <button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Add holiday'}</button>
        </form>
      )}
      {loading && <Spinner />}
      {error && <ErrorState error={error} onRetry={reload} />}
      {!loading && !error && (
        <section className="card">
          {items.length ? <ul className="holiday-list">
            {items.map((holiday) => (
              <li key={holiday.id} className={holiday.date < today ? 'holiday-past' : ''}>
                <div><strong>{holiday.name}</strong><span className="muted">{formatDate(holiday.date)}</span></div>
                {user.role === 'HOD' && <button type="button" className="btn btn-ghost btn-sm" onClick={() => remove(holiday)} disabled={busy}>Delete</button>}
              </li>
            ))}
          </ul> : <p className="muted">No public holidays have been added.</p>}
        </section>
      )}
    </>
  );
}
