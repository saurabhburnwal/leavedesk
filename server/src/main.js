import { loadConfig } from './config.js';
import { openDatabase } from './db/database.js';
import { createApp, createServices } from './app.js';
import { seedDemoData } from './db/seed.js';

const config = loadConfig();
const db = openDatabase(config.dbFile);
const services = createServices(db, config);

if (config.seedDemoData && services.users.count() === 0) {
  seedDemoData(services, config);
  console.log('  Seeded demo users and sample leave requests.');
}

const app = createApp({ db, config, services });
const server = app.listen(config.port, config.host, () => {
  console.log(`\n  Leave Management System is running at http://localhost:${config.port}`);
  console.log('  Demo login: employee@example.com / manager@example.com / hod@example.com  (password: Password@123)');
  console.log('  Press Ctrl+C to stop.\n');
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n  Port ${config.port} is already in use. Stop the other app or start with a different port, e.g. PORT=4000 npm run serve\n`);
    process.exit(1);
  }
  throw err;
});

function shutdown() {
  server.close(() => {
    db.close();
    process.exit(0);
  });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
