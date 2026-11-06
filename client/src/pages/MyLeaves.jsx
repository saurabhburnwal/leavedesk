import { Link, useSearchParams } from 'react-router-dom';
import { Api } from '../api.js';
import { useApi } from '../context.jsx';
import { EmptyState, ErrorState, PageHeader, Spinner } from '../components/ui.jsx';
import { LeaveTable } from '../components/LeaveTable.jsx';
import { STATUS_META } from '../utils.js';

export const STATUS_FILTERS = ['', 'PENDING', 'INFO_REQUESTED', 'APPROVED', 'REJECTED', 'CANCELLED'];

export function StatusFilter({ value, onChange, counts }) {
  return (
    <div className="chips" role="tablist" aria-label="Filter by status">
      {STATUS_FILTERS.map((status) => (
        <button
          key={status || 'ALL'}
          role="tab"
          aria-selected={value === status}
          className={`chip ${status ? `chip-${STATUS_META[status].tone}` : ''} ${value === status ? 'active' : ''}`}
          onClick={() => onChange(status)}
        >
          {status ? STATUS_META[status].label : 'All'}
          {counts && <span className="chip-count">{status ? counts[status] ?? 0 : counts.ALL}</span>}
        </button>
      ))}
    </div>
  );
}

export function MyLeavesPage() {
  const [params, setParams] = useSearchParams();
  const status = params.get('status') ?? '';
  // Load everything once and filter on the client so the counts stay accurate.
  const { data, error, loading, reload } = useApi(() => Api.myLeaves(), []);

  const items = data?.items ?? [];
  const counts = items.reduce((acc, l) => ({ ...acc, [l.status]: (acc[l.status] ?? 0) + 1 }), { ALL: items.length });
  const visible = status ? items.filter((l) => l.status === status) : items;

  return (
    <>
      <PageHeader
        title="My leaves"
        subtitle="Your full leave history and the status of every request."
        actions={
          <Link to="/apply" className="btn btn-primary">
            + Apply for leave
          </Link>
        }
      />
      <StatusFilter value={status} counts={counts} onChange={(s) => setParams(s ? { status: s } : {})} />
      {loading && <Spinner />}
      {error && <ErrorState error={error} onRetry={reload} />}
      {data &&
        (visible.length ? (
          <div className="card flush">
            <LeaveTable items={visible} />
          </div>
        ) : (
          <EmptyState
            title={status ? `No ${STATUS_META[status].label.toLowerCase()} requests` : 'No leave requests yet'}
            action={
              !status && (
                <Link to="/apply" className="btn btn-primary">
                  Apply for leave
                </Link>
              )
            }
          >
            {status ? 'Try another filter.' : 'Your requests will appear here once you apply.'}
          </EmptyState>
        ))}
    </>
  );
}
