import { z } from 'zod';
import { transaction } from '../db/database.js';
import { AppError, parseOrThrow } from '../utils/errors.js';
import { parseIsoDate } from '../utils/dates.js';

const holidaySchema = z.object({
  date: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a valid holiday date.'),
  name: z.string().trim().min(2, 'Holiday name should be at least 2 characters.').max(100, 'Holiday name can be at most 100 characters.'),
});

export class HolidayService {
  constructor({ db, holidays, audit }) { Object.assign(this, { db, holidays, audit }); }
  list() { return this.holidays.list(); }
  dates() { return this.holidays.dates(); }

  add(user, input, ctx = {}) {
    if (user.role !== 'HOD') throw AppError.forbidden('Only HODs can add public holidays.');
    const value = parseOrThrow(holidaySchema, input);
    if (!parseIsoDate(value.date)) throw AppError.validation('Please choose a real calendar date.', { date: 'Holiday date is not valid.' });
    if (this.holidays.findByDate(value.date)) throw AppError.conflict('A public holiday already exists on this date.', { date: 'A holiday already exists on this date.' });
    const id = transaction(this.db, () => {
      const holidayId = this.holidays.add({ ...value, createdBy: user.id });
      this.audit.log({ actor: user, action: 'HOLIDAY_ADDED', entityType: 'HOLIDAY', entityId: holidayId, details: value, ip: ctx.ip });
      return holidayId;
    });
    return this.holidays.findById(id);
  }

  delete(user, holidayId, ctx = {}) {
    if (user.role !== 'HOD') throw AppError.forbidden('Only HODs can remove public holidays.');
    const id = Number(holidayId);
    const holiday = Number.isInteger(id) && id > 0 ? this.holidays.findById(id) : null;
    if (!holiday) throw AppError.notFound('That public holiday could not be found.');
    transaction(this.db, () => {
      this.holidays.delete(id);
      this.audit.log({ actor: user, action: 'HOLIDAY_DELETED', entityType: 'HOLIDAY', entityId: id, details: holiday, ip: ctx.ip });
    });
    return holiday;
  }
}
