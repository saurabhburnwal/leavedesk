import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const SCHEMA_FILE = path.join(import.meta.dirname, 'schema.sql');

/**
 * Opens (or creates) the SQLite database and applies the schema.
 * Uses Node's built-in `node:sqlite`, so there is no native module to compile
 * and no database server to install.
 */
export function openDatabase(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });

  const db = new DatabaseSync(file);
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA busy_timeout = 5000;');
  if (file !== ':memory:') db.exec('PRAGMA journal_mode = WAL;');
  db.exec(fs.readFileSync(SCHEMA_FILE, 'utf8'));
  return db;
}

/**
 * Runs `fn` inside a transaction: either every statement succeeds or none do.
 * Used so a status change, its timeline entry and its audit log are atomic.
 */
export function transaction(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export const nowIso = () => new Date().toISOString();
