import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Api } from '../api.js';
import { useApi } from '../context.jsx';
import { EmptyState, ErrorState, PageHeader, Spinner } from '../components/ui.jsx';
import { LeaveTable } from '../components/LeaveTable.jsx';
import { StatusFilter } from './MyLeaves.jsx';

export function ApprovalsPage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'team' ? 'team' : 'pending';
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');

  const pending = useApi(() => Api.pendingApprovals(), []);
  const team = useApi(() => (tab === 'team' ? Api.teamLeaves() : Promise.resolve(null)), [tab]);

  const active = tab === 'pending' ? pending : team;
  const all = active.data?.items ?? [];
  const query = search.trim().toLowerCase();
  const items = all
    .filter((l) => tab === 'pending' || !status || l.status === status)
    .filter((l) => !query || l.employeeName.toLowerCase().includes(query) || l.reason.toLowerCase().includes(query));

  const counts = tab === 'team' ? all.reduce((acc, l) => ({ ...acc, [l.status]: (acc[l.status] ?? 0) + 1 }), { ALL: all.length }) : null;

  return (
    <>
      <PageHeader title="Approvals" subtitle="Review your team's leave requests. Open a request to view its documents, comment and decide." />

      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'pending'} className={`tab ${tab === 'pending' ? 'active' : ''}`} onClick={() => setParams({})}>
          Waiting for me
          {pending.data && <span className="nav-badge">{pending.data.items.length}</span>}
        </button>
        <button role="tab" aria-selected={tab === 'team'} className={`tab ${tab === 'team' ? 'active' : ''}`} onClick={() => setParams({ tab: 'team' })}>
          All team requests
        </button>
      </div>

      <div className="toolbar">
        <input
          type="search"
          className="search"
          placeholder="Search by employee or reason…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search requests"
        />
      </div>
      {tab === 'team' && <StatusFilter value={status} onChange={setStatus} counts={counts} />}

      {active.loading && <Spinner />}
      {active.error && <ErrorState error={active.error} onRetry={active.reload} />}
      {active.data &&
        (items.length ? (
          <div className="card flush">
            <LeaveTable items={items} showEmployee />
          </div>
        ) : tab === 'pending' && !query ? (
          <EmptyState icon="✅" title="You're all caught up">
            No requests are waiting for your approval right now.
          </EmptyState>
        ) : (
          <EmptyState title="No matching requests">Try a different search or filter.</EmptyState>
        ))}
    </>
  );
}
