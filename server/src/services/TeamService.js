import { z } from 'zod';
import { transaction } from '../db/database.js';
import { AppError, parseOrThrow } from '../utils/errors.js';

const updateSchema = z.object({
  role: z.enum(['EMPLOYEE', 'MANAGER'], { error: 'Role must be Employee or Manager.' }),
  managerId: z.coerce.number({ error: 'Please choose a reporting manager.' }).int().positive('Please choose a reporting manager.'),
});

/**
 * HOD-only team management: promote an employee to manager (or back) and change
 * who someone reports to. In-flight leave requests keep their approver snapshot.
 */
export class TeamService {
  constructor({ db, users, audit }) {
    Object.assign(this, { db, users, audit });
  }

  list(hod) {
    const members = this.users.listByDepartment(hod.departmentId).map((u) => ({
      ...u,
      directReports: this.users.countDirectReports(u.id),
      pendingApprovals: u.role === 'EMPLOYEE' ? 0 : this.users.countPendingApprovals(u.id),
    }));
    return {
      department: hod.department,
      members,
      approvers: members.filter((m) => (m.role === 'MANAGER' || m.role === 'HOD') && m.emailVerified).map(({ id, name, role }) => ({ id, name, role })),
    };
  }

  update(hod, userId, input, ctx = {}) {
    const { role, managerId } = parseOrThrow(updateSchema, input);
    const target = this.users.findById(Number(userId));
    if (!target || target.departmentId !== hod.departmentId) throw AppError.notFound('That team member was not found in your department.');
    if (target.role === 'HOD') throw AppError.forbidden("The HOD's role can't be changed here.");

    const manager = this.users.findById(managerId);
    const managerOk = manager && manager.departmentId === hod.departmentId && ['MANAGER', 'HOD'].includes(manager.role) && manager.emailVerified;
    if (!managerOk) throw AppError.validation('Please fix the highlighted fields.', { managerId: 'Choose a manager or the HOD from your department.' });
    if (manager.id === target.id) throw AppError.validation('Please fix the highlighted fields.', { managerId: "Someone can't report to themselves." });
    if (manager.managerId === target.id) {
      throw AppError.validation('Please fix the highlighted fields.', { managerId: `${manager.name} reports to ${target.name}, so this would create a loop.` });
    }

    if (target.role === 'MANAGER' && role === 'EMPLOYEE') {
      const reports = this.users.countDirectReports(target.id);
      if (reports > 0) throw AppError.conflict(`Reassign ${target.name}'s ${reports} direct report${reports === 1 ? '' : 's'} to another manager first.`);
      const pending = this.users.countPendingApprovals(target.id);
      if (pending > 0) throw AppError.conflict(`${target.name} still has ${pending} leave request${pending === 1 ? '' : 's'} waiting for their approval. Resolve them first.`);
    }

    if (role === target.role && managerId === target.managerId) throw AppError.validation('Nothing to save: no changes were made.');

    transaction(this.db, () => {
      this.users.updateRoleAndManager(target.id, { role, managerId });
      this.audit.log({
        actor: hod,
        action: role !== target.role ? 'USER_ROLE_CHANGED' : 'USER_MANAGER_CHANGED',
        entityType: 'USER',
        entityId: target.id,
        details: {
          name: target.name,
          before: { role: target.role, manager: target.managerName },
          after: { role, manager: manager.name },
        },
        ip: ctx.ip,
      });
    });
    return this.list(hod);
  }
}
