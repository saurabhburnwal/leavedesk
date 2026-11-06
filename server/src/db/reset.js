// `npm run reset`: wipes the database and uploaded files, then re-creates the demo data.
import fs from 'node:fs';
import { loadConfig } from '../config.js';
import { openDatabase } from './database.js';
import { createServices } from '../app.js';
import { seedDemoData } from './seed.js';

const config = loadConfig();
for (const suffix of ['', '-wal', '-shm']) fs.rmSync(config.dbFile + suffix, { force: true });
fs.rmSync(config.uploadDir, { recursive: true, force: true });

const db = openDatabase(config.dbFile);
seedDemoData(createServices(db, config), config);
db.close();
console.log('Database reset and demo data re-created.');
