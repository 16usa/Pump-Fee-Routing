import { migrate, resetDatabase, seedIfEmpty } from '../server/db.js';
migrate(); resetDatabase(); seedIfEmpty(); console.log('Database reset and seed applied.');
