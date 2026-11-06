/**
 * OWNER: Codex. Called at the end of seedDemoData() to seed holidays (and anything else
 * the leave-balance/holiday feature needs). Runs once on an empty database.
 */
export function seedLeavePolicy(services, _config) {
  const db = services.holidays?.db;
  if (!db || db.prepare('SELECT COUNT(*) AS n FROM holidays').get().n) return;
  const year = new Date().getFullYear();
  const dates = [
    [`${year}-08-15`, 'Independence Day'], [`${year}-10-02`, 'Gandhi Jayanti'], [`${year}-12-25`, 'Christmas Day'],
    [`${year + 1}-01-26`, 'Republic Day'], [`${year + 1}-08-15`, 'Independence Day'],
    [`${year + 1}-10-02`, 'Gandhi Jayanti'], [`${year + 1}-12-25`, 'Christmas Day'],
  ];
  const insert = db.prepare('INSERT OR IGNORE INTO holidays (holiday_date, name, created_by, created_at) VALUES (?, ?, NULL, ?)');
  for (const [date, name] of dates) insert.run(date, name, new Date().toISOString());
}
