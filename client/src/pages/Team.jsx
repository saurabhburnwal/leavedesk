import { useState } from 'react';
import { AuthApi } from '../api/auth.js';
import { useApi, useToast } from '../context.jsx';
import { Avatar, ErrorState, PageHeader, Spinner } from '../components/ui.jsx';
import { ROLE_LABEL } from '../utils.js';

/** OWNER: Claude. HOD manages roles (Employee <-> Manager) and reporting managers. Route: /team */
export function TeamPage() {
  const { data, error, loading, reload, setData } = useApi(() => AuthApi.team(), []);

  return (
    <>
      <PageHeader
        title="Team"
        subtitle={`Promote employees to Manager and set who everyone reports to${data ? ` · ${data.department}` : ''}. Changes apply to new leave requests; requests already in progress keep their approvers.`}
      />
      {loading && !data && <Spinner />}
      {error && <ErrorState error={error} onRetry={reload} />}
      {data && (
        <div className="card flush">
          <div className="table-wrap">
            <table className="leave-table audit-table">
              <thead>
                <tr>
                  <th>Member</th>
                  <th>Role</th>
                  <th>Reports to</th>
                  <th>Direct reports</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.members.map((m) => (
                  <MemberRow key={`${m.id}-${m.role}-${m.managerId}`} member={m} approvers={data.approvers} onSaved={setData} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}

function MemberRow({ member, approvers, onSaved }) {
  const toast = useToast();
  const [role, setRole] = useState(member.role);
  const [managerId, setManagerId] = useState(member.managerId ?? '');
  const [busy, setBusy] = useState(false);
  const isHod = member.role === 'HOD';
  const changed = role !== member.role || Number(managerId) !== member.managerId;

  async function save() {
    setBusy(true);
    try {
      const next = await AuthApi.updateMember(member.id, { role, managerId: Number(managerId) });
      toast.success(`${member.name} updated.`);
      onSaved(next);
    } catch (err) {
      toast.error(err.fields?.managerId ?? err.message);
      setBusy(false);
    }
  }

  return (
    <tr>
      <td data-label="Member">
        <span className="person">
          <Avatar name={member.name} size="sm" />
          <span>
            {member.name}
            <span className="muted small block">{member.email}</span>
            {!member.emailVerified && <span className="unverified">Email not verified</span>}
          </span>
        </span>
      </td>
      <td data-label="Role">
        {isHod ? (
          <span className="role-pill role-hod">{ROLE_LABEL.HOD}</span>
        ) : (
          <select value={role} onChange={(e) => setRole(e.target.value)} aria-label={`Role for ${member.name}`}>
            <option value="EMPLOYEE">Employee</option>
            <option value="MANAGER">Manager</option>
          </select>
        )}
      </td>
      <td data-label="Reports to">
        {isHod ? (
          <span className="muted">-</span>
        ) : (
          <select value={managerId} onChange={(e) => setManagerId(e.target.value)} aria-label={`Reporting manager for ${member.name}`}>
            {approvers
              .filter((a) => a.id !== member.id)
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.role === 'HOD' ? 'HOD' : 'Manager'})
                </option>
              ))}
          </select>
        )}
      </td>
      <td data-label="Direct reports">
        {member.directReports}
        {member.pendingApprovals > 0 && <span className="flag">{member.pendingApprovals} pending</span>}
      </td>
      <td data-label="Actions">
        {!isHod && (
          <div className="team-row-actions">
            <button className="btn btn-sm btn-primary" disabled={!changed || busy} onClick={save}>
              {busy ? 'Saving…' : 'Save'}
            </button>
            {changed && !busy && (
              <button
                className="btn btn-sm btn-ghost"
                onClick={() => {
                  setRole(member.role);
                  setManagerId(member.managerId ?? '');
                }}
              >
                Undo
              </button>
            )}
          </div>
        )}
      </td>
    </tr>
  );
}
