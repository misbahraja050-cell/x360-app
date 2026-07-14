import 'dotenv/config';
import { initDatabase } from '../server/db.js';

console.log('Initializing database...');
initDatabase()
  .then(() => {
    console.log('Database initialization succeeded!');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Database initialization failed:', err);
    process.exit(1);
  });
