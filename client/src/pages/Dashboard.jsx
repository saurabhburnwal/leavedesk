import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Api, request } from '../api.js';
import { useApi, useAuth } from '../context.jsx';
import { Avatar, ErrorState, LeaveTypeTag, Spinner } from '../components/ui.jsx';
import { HeroIllustration } from '../components/HeroIllustration.jsx';
import { formatDate, formatLeaveDays, formatRange, daysBetween, todayIso } from '../utils.js';
import '../styles/dashboard.css';

const STATUS_LABEL = {
  PENDING: 'Pending',
  INFO_REQUESTED: 'Info requested',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  CANCELLED: 'Cancelled',
};

export function DashboardPage() {
  const { user } = useAuth();
  const isHod = user.role === 'HOD';
  const isApprover = user.role === 'MANAGER' || isHod;
  const { data, error, loading, reload } = useApi(() => Api.dashboard(), []);
  const balances = useApi(
    () => (isHod ? Promise.resolve(null) : request('GET', '/api/leaves/balances').then((result) => result.balances)),
    [isHod],
  );
  const holidays = useApi(() => request('GET', '/api/holidays').then((result) => result.items), []);

  const firstName = user.name.split(' ')[0];
  const greeting = new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 17 ? 'Good afternoon' : 'Good evening';
  const leaveStats = balances.data?.byType;
  const availableDays = leaveStats
    ? ['CASUAL', 'SICK', 'EARNED'].reduce((total, type) => total + (leaveStats[type]?.available ?? 0), 0)
    : '—';
  const usedDays = leaveStats
    ? Object.values(leaveStats).reduce((total, balance) => total + (balance.used ?? 0), 0)
    : '—';
  const teamItems = useMemo(() => {
    if (!data) return [];
    if (isApprover) return uniqueLeaveItems([...(data.approver?.onLeaveToday ?? []), ...(data.approver?.upcomingTeamLeave ?? [])]);
    return data.team ?? [];
  }, [data, isApprover]);

  const busy = loading || (!isHod && balances.loading) || holidays.loading;

  return (
    <main className="dashboard-page">
      <header className="dashboard-greeting">
        <div>
          <p className="dashboard-eyebrow">{greeting}</p>
          <h1>Hello, {firstName}!</h1>
          <p className="dashboard-subtitle">
            {isHod
              ? `${user.department} · Department overview`
              : `Here’s your leave overview for ${new Date().getFullYear()} · ${user.department}${user.managerName ? ` · Reports to ${user.managerName}` : ''}`}
          </p>
        </div>
        {!isHod && (
          <Link to="/apply" className="dashboard-apply">
            <span aria-hidden="true">＋</span> Apply for leave
          </Link>
        )}
      </header>

      {busy && <Spinner />}
      {error && <ErrorState error={error} onRetry={reload} />}
      {balances.error && !isHod && <ErrorState error={balances.error} onRetry={balances.reload} />}
      {holidays.error && <ErrorState error={holidays.error} onRetry={holidays.reload} />}

      {!isHod && data && (
        <section className="dashboard-stats-card" aria-label="Your leave summary">
          <div className="dashboard-stats">
            <SummaryStat label="Available leaves this year" value={availableDays} suffix="days" icon="calendar" />
            <SummaryStat label="Leaves used this year" value={usedDays} suffix="days" icon="check" />
            <SummaryStat label="Pending" value={data.mine.counts.PENDING ?? 0} icon="clock" to="/leaves?status=PENDING" />
            <SummaryStat label="Needs your reply" value={data.mine.counts.INFO_REQUESTED ?? 0} icon="reply" to="/leaves?status=INFO_REQUESTED" />
          </div>
          <HeroIllustration className="dashboard-hero-art" />
        </section>
      )}

      {!isHod && data?.mine.counts.INFO_REQUESTED > 0 && (
        <div className="dashboard-info-alert">
          <span>Your approver needs more information on {data.mine.counts.INFO_REQUESTED} request{data.mine.counts.INFO_REQUESTED === 1 ? '' : 's'}.</span>
          <Link to="/leaves?status=INFO_REQUESTED">Reply now →</Link>
        </div>
      )}

      {data && (
        <div className="dashboard-grid">
          {!isHod && <LatestLeaves items={data.mine.recent ?? []} upcoming={data.mine.upcoming ?? []} />}
          <TeamLeaves items={teamItems} isApprover={isApprover} />
          <UpcomingHolidays items={holidays.data ?? []} />
        </div>
      )}

      {isApprover && data?.approver && <ApprovalsCard data={data.approver} />}
    </main>
  );
}

function SummaryStat({ label, value, suffix, icon, to }) {
  const Tag = to ? Link : 'div';
  return (
    <Tag className={`dashboard-summary-stat ${to ? 'dashboard-stat-link' : ''}`} to={to}>
      <span className="dashboard-stat-icon" aria-hidden="true"><Icon name={icon} /></span>
      <span className="dashboard-stat-value">{value}{suffix && <small> {suffix}</small>}</span>
      <span className="dashboard-stat-label">{label}</span>
    </Tag>
  );
}

function DashboardCard({ title, icon, children, className = '' }) {
  return (
    <section className={`dashboard-card ${className}`}>
      <div className="dashboard-card-heading">
        <span className={`dashboard-card-icon icon-${icon}`} aria-hidden="true"><Icon name={icon} /></span>
        <h2>{title}</h2>
      </div>
      {children}
    </section>
  );
}

function LatestLeaves({ items, upcoming }) {
  return (
    <DashboardCard title="My latest leaves" icon="calendar" className="latest-leaves-card">
      {items.length ? (
        <ul className="latest-leaves-list">
          {items.slice(0, 4).map((leave) => (
            <li key={leave.id}>
              <div className="latest-leave-topline">
                <Link to={`/leaves/${leave.id}`} className="latest-leave-type"><LeaveTypeTag type={leave.leaveType} short /></Link>
                <StatusPill status={leave.status} />
              </div>
              <div className="leave-date-route">
                <time>{formatDate(leave.fromDate)}</time>
                <span className="route-dots" aria-hidden="true" />
                <span className="route-days">{formatLeaveDays(leave)}</span>
                <span className="route-dots" aria-hidden="true" />
                <time>{formatDate(leave.toDate)}</time>
              </div>
            </li>
          ))}
        </ul>
      ) : <p className="dashboard-empty">No leave requests yet.</p>}
      {upcoming.length > 0 && (
        <div className="upcoming-own-leaves">
          <h3>Upcoming approved leave</h3>
          <ul>
            {upcoming.slice(0, 3).map((leave) => (
              <li key={leave.id}>
                <Link to={`/leaves/${leave.id}`}>{formatRange(leave.fromDate, leave.toDate, { short: true })}</Link>
                <LeaveTypeTag type={leave.leaveType} short />
              </li>
            ))}
          </ul>
        </div>
      )}
      <Link className="dashboard-show-more" to="/leaves">Show more <span aria-hidden="true">→</span></Link>
    </DashboardCard>
  );
}

function StatusPill({ status }) {
  return <span className={`status-outline status-${status.toLowerCase()}`}><span className="status-outline-dot" />{STATUS_LABEL[status] ?? status}</span>;
}

function TeamLeaves({ items, isApprover }) {
  const today = todayIso();
  return (
    <DashboardCard title="My team leaves" icon="people" className="team-leaves-card">
      {items.length ? (
        <ul className="team-leaves-list">
          {items.slice(0, 5).map((leave) => {
            const onLeave = leave.fromDate <= today && leave.toDate >= today;
            const until = Math.max(1, daysBetween(today, leave.toDate) + 1);
            const inDays = Math.max(0, daysBetween(today, leave.fromDate));
            return (
              <li key={leave.id}>
                <Avatar name={leave.employeeName} size="sm" />
                <div className="team-leave-info">
                  <strong>{leave.employeeName}</strong>
                  <span>{formatRange(leave.fromDate, leave.toDate, { short: true })}</span>
                </div>
                <div className={`team-leave-state ${onLeave ? 'team-state-now' : 'team-state-planned'}`}>
                  <strong>{onLeave ? 'On leave' : 'Planned'}</strong>
                  <span>{onLeave ? `${until} ${until === 1 ? 'day' : 'days'} left` : `in ${inDays} ${inDays === 1 ? 'day' : 'days'}`}</span>
                </div>
              </li>
            );
          })}
        </ul>
      ) : <p className="dashboard-empty">{isApprover ? 'No teammates are away in the next two weeks.' : 'No approved team leave in the next 30 days.'}</p>}
    </DashboardCard>
  );
}

function UpcomingHolidays({ items }) {
  const today = todayIso();
  const next = items.filter((holiday) => holiday.date >= today).slice(0, 4);
  return (
    <DashboardCard title="Upcoming holidays" icon="sun" className="upcoming-holidays-card">
      {next.length ? (
        <ul className="holiday-preview-list">
          {next.map((holiday) => (
            <li key={holiday.id}>
              <span className="holiday-date-badge">{formatDate(holiday.date).split(' ').slice(0, 2).join(' ')}</span>
              <strong>{holiday.name}</strong>
              <span className="holiday-weekday">{new Date(`${holiday.date}T00:00:00Z`).toLocaleDateString('en-IN', { weekday: 'short', timeZone: 'UTC' })}</span>
            </li>
          ))}
        </ul>
      ) : <p className="dashboard-empty">No upcoming holidays listed.</p>}
      <Link className="dashboard-show-more" to="/holidays">View holiday calendar <span aria-hidden="true">→</span></Link>
    </DashboardCard>
  );
}

function ApprovalsCard({ data }) {
  const pending = data.pendingPreview?.slice(0, 3) ?? [];
  return (
    <DashboardCard title="Approvals" icon="inbox" className="approvals-dashboard-card">
      <div className="approvals-summary">
        <span><strong>{data.pendingCount}</strong> requests waiting for your decision</span>
        <Link to="/approvals" className="dashboard-show-more">Open approvals <span aria-hidden="true">→</span></Link>
      </div>
      {pending.length ? (
        <ul className="approval-preview-list">
          {pending.map((leave) => (
            <li key={leave.id}>
              <Avatar name={leave.employeeName} size="sm" />
              <div><strong>{leave.employeeName}</strong><span>{formatRange(leave.fromDate, leave.toDate, { short: true })} · {formatLeaveDays(leave)}</span></div>
              <StatusPill status={leave.status} />
              <Link to={`/leaves/${leave.id}`} aria-label={`Review leave request from ${leave.employeeName}`}>Review →</Link>
            </li>
          ))}
        </ul>
      ) : <p className="dashboard-empty">You're all caught up. No requests are waiting for approval.</p>}
    </DashboardCard>
  );
}

function Icon({ name }) {
  const paths = {
    calendar: <><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M16 3v4M8 3v4M3 10h18" /></>,
    check: <><circle cx="12" cy="12" r="9" /><path d="m8 12 2.5 2.5L16 9" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    reply: <><path d="M20 11a7 7 0 0 1-7 7H7l-4 3V7a3 3 0 0 1 3-3h7a7 7 0 0 1 7 7Z" /><path d="m8 11 3-3 3 3M11 8v6" /></>,
    people: <><circle cx="9" cy="8" r="3" /><path d="M3 20v-1a6 6 0 0 1 12 0v1M16 5.5a3 3 0 0 1 0 5.8M18 14a5 5 0 0 1 3 4.5v1" /></>,
    sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42" /></>,
    inbox: <><path d="M4 4h16l2 11v5H2v-5L4 4Z" /><path d="M2 14h6l2 3h4l2-3h6" /></>,
  };
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name] ?? paths.calendar}</svg>;
}

function uniqueLeaveItems(items) {
  return [...new Map(items.map((item) => [item.id, item])).values()];
}
