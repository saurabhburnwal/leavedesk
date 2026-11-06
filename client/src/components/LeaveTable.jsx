import { Link, useNavigate } from 'react-router-dom';
import { LeaveTypeTag, StatusBadge, Avatar } from './ui.jsx';
import { formatRange, pluralize, timeAgo } from '../utils.js';

/**
 * Responsive list of leave requests: a table on desktop, stacked cards on phones
 * (see `.leave-table` in styles.css).
 */
export function LeaveTable({ items, showEmployee = false, compact = false }) {
  const navigate = useNavigate();

  return (
    <div className="table-wrap">
      <table className="leave-table">
        <thead>
          <tr>
            <th>#</th>
            {showEmployee && <th>Employee</th>}
            <th>Dates</th>
            <th>Type</th>
            <th>Days</th>
            {!compact && <th>Reason</th>}
            <th>Status</th>
            {!compact && <th>Updated</th>}
          </tr>
        </thead>
        <tbody>
          {items.map((leave) => (
            <tr key={leave.id} className={`row-${leave.status.toLowerCase()}`} onClick={() => navigate(`/leaves/${leave.id}`)}>
              <td data-label="Request">
                <Link to={`/leaves/${leave.id}`} onClick={(e) => e.stopPropagation()} className="id-link">
                  #{leave.id}
                </Link>
              </td>
              {showEmployee && (
                <td data-label="Employee">
                  <span className="person">
                    <Avatar name={leave.employeeName} size="sm" />
                    {leave.employeeName}
                  </span>
                </td>
              )}
              <td data-label="Dates" className="nowrap">
                {formatRange(leave.fromDate, leave.toDate, { short: compact })}
              </td>
              <td data-label="Type">
                <LeaveTypeTag type={leave.leaveType} short />
              </td>
              <td data-label="Working days">
                <span className="days">{pluralize(leave.workingDays, 'day')}</span>
                {leave.requiresDocuments && (
                  <span className="flag" title="More than 3 working days: documents + Manager and HOD approval">
                    2-level
                  </span>
                )}
              </td>
              {!compact && (
                <td data-label="Reason" className="reason-cell">
                  {leave.reason}
                </td>
              )}
              <td data-label="Status">
                <StatusBadge status={leave.status} stage={leave.currentStage} />
              </td>
              {!compact && (
                <td data-label="Updated" className="muted nowrap">
                  {timeAgo(leave.updatedAt)}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
