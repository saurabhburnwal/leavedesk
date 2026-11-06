import { Link, useNavigate } from 'react-router-dom';
import { Api } from '../api.js';
import { useApi, useAuth } from '../context.jsx';
import { ErrorState, EmptyState, LeaveTypeTag, PageHeader, Spinner, StatCard, Avatar } from '../components/ui.jsx';
import { LeaveTable } from '../components/LeaveTable.jsx';
import { formatLeaveDays, formatRange, pluralize, ROLE_LABEL } from '../utils.js';

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

export function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data, error, loading, reload } = useApi(() => Api.dashboard(), []);

  return (
    <>
      <PageHeader
        title={`${greeting()}, ${user.name.split(' ')[0]}`}
        subtitle={`${ROLE_LABEL[user.role]} · ${user.department}${user.managerName ? ` · Reports to ${user.managerName}` : ''}`}
        actions={
          user.role !== 'HOD' && (
            <Link to="/apply" className="btn btn-primary">
              + Apply for leave
            </Link>
          )
        }
      />

      {loading && <Spinner />}
      {error && <ErrorState error={error} onRetry={reload} />}

      {data?.approver && <ApproverPanel data={data.approver} />}

      {data?.canApply && (
        <>
          <section aria-labelledby="my-leave-heading">
            <h2 id="my-leave-heading" className="section-title">
              My leave
            </h2>
            <div className="stats">
              <StatCard label="Pending" value={data.mine.counts.PENDING} tone="pending" onClick={() => navigate('/leaves?status=PENDING')} />
              <StatCard
                label="Needs your reply"
                value={data.mine.counts.INFO_REQUESTED}
                tone="info"
                onClick={() => navigate('/leaves?status=INFO_REQUESTED')}
              />
              <StatCard label="Approved" value={data.mine.counts.APPROVED} tone="approved" onClick={() => navigate('/leaves?status=APPROVED')} />
              <StatCard label="Rejected" value={data.mine.counts.REJECTED} tone="rejected" onClick={() => navigate('/leaves?status=REJECTED')} />
              <StatCard label="Days approved this year" value={data.mine.approvedDaysThisYear} tone="neutral" hint="Working days" />
              {Object.entries(data.mine.balances?.byType ?? {}).map(([type, balance]) => (
                <StatCard key={type} label={`${type[0]}${type.slice(1).toLowerCase()} leave`} value={balance.available === null ? 'Unlimited' : `${balance.available} left`} tone="neutral" hint={`${balance.used} used${balance.pending ? ` · ${balance.pending} pending` : ''}`} />
              ))}
            </div>
          </section>

          {data.mine.counts.INFO_REQUESTED > 0 && (
            <div className="alert alert-info">
              <span>
                Your approver needs more information on {pluralize(data.mine.counts.INFO_REQUESTED, 'request')}. Reply so it can move forward.
              </span>
              <Link className="btn btn-sm btn-secondary" to="/leaves?status=INFO_REQUESTED">
                View
              </Link>
            </div>
          )}

          <div className="two-col">
            <section className="card">
              <div className="card-head">
                <h2>Recent requests</h2>
                <Link to="/leaves" className="link">
                  View all →
                </Link>
              </div>
              {data.mine.recent.length ? (
                <LeaveTable items={data.mine.recent} compact />
              ) : (
                <EmptyState title="No leave requests yet" action={<Link to="/apply" className="btn btn-primary">Apply for leave</Link>}>
                  When you apply for leave, it will show up here.
                </EmptyState>
              )}
            </section>

            <section className="card">
              <div className="card-head">
                <h2>Upcoming approved leave</h2>
              </div>
              {data.mine.upcoming.length ? (
                <ul className="mini-list">
                  {data.mine.upcoming.map((l) => (
                    <li key={l.id}>
                      <Link to={`/leaves/${l.id}`}>{formatRange(l.fromDate, l.toDate)}</Link>
                      <LeaveTypeTag type={l.leaveType} short />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted">No upcoming approved leave.</p>
              )}
            </section>
          </div>
        </>
      )}
    </>
  );
}

function ApproverPanel({ data }) {
  return (
    <section aria-labelledby="approvals-heading" className="approver-panel">
      <h2 id="approvals-heading" className="section-title">
        Team approvals
      </h2>
      <div className="stats">
        <StatCard label="Waiting for your decision" value={data.pendingCount} tone={data.pendingCount ? 'pending' : 'neutral'} />
        <StatCard label="Long leave (needs documents)" value={data.pendingLongLeaveCount} tone="info" />
        <StatCard label="Waiting for employee reply" value={data.awaitingEmployeeCount} tone="neutral" />
        <StatCard label="Team on leave today" value={data.onLeaveToday.length} tone="approved" />
      </div>

      <div className="two-col">
        <section className="card">
          <div className="card-head">
            <h2>Needs your action</h2>
            <Link to="/approvals" className="link">
              Open approvals →
            </Link>
          </div>
          {data.pendingPreview.length ? (
            <LeaveTable items={data.pendingPreview} showEmployee compact />
          ) : (
            <EmptyState icon="✅" title="You're all caught up">
              No requests are waiting for your approval.
            </EmptyState>
          )}
        </section>

        <section className="card">
          <div className="card-head">
            <h2>Who's away</h2>
          </div>
          <h4 className="mini-title">Today</h4>
          {data.onLeaveToday.length ? (
            <ul className="mini-list">
              {data.onLeaveToday.map((l) => (
                <li key={l.id}>
                  <span className="person">
                    <Avatar name={l.employeeName} size="sm" /> {l.employeeName}
                  </span>
                  <LeaveTypeTag type={l.leaveType} short />
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted small">Everyone is in today.</p>
          )}
          <h4 className="mini-title">Next 14 days</h4>
          {data.upcomingTeamLeave.length ? (
            <ul className="mini-list">
              {data.upcomingTeamLeave.map((l) => (
                <li key={l.id}>
                  <span className="person">
                    <Avatar name={l.employeeName} size="sm" /> {l.employeeName}
                  </span>
                  <span className="muted small">{formatRange(l.fromDate, l.toDate)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted small">No approved leave coming up.</p>
          )}
        </section>
      </div>
    </section>
  );
}
