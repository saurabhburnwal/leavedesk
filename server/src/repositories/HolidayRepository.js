import { nowIso } from '../db/database.js';

export class HolidayRepository {
  constructor(db) { this.db = db; }

  list() {
    return this.db.prepare('SELECT id, holiday_date AS date, name FROM holidays ORDER BY holiday_date').all();
  }

  dates() { return this.db.prepare('SELECT holiday_date FROM holidays').all().map((row) => row.holiday_date); }

  add({ date, name, createdBy }) {
    const result = this.db.prepare('INSERT INTO holidays (holiday_date, name, created_by, created_at) VALUES (?, ?, ?, ?)')
      .run(date, name, createdBy, nowIso());
    return Number(result.lastInsertRowid);
  }

  delete(id) { return this.db.prepare('DELETE FROM holidays WHERE id = ?').run(id).changes === 1; }
  findByDate(date) { return this.db.prepare('SELECT id FROM holidays WHERE holiday_date = ?').get(date) ?? null; }
  findById(id) { return this.db.prepare('SELECT id, holiday_date AS date, name FROM holidays WHERE id = ?').get(id) ?? null; }
}
