import 'dotenv/config'; import mongoose from 'mongoose'; import cron from 'node-cron';
import { buildApp, runReminders } from './app.js'; import { seed } from './seed.js'; import { User } from './models.js';
let uri = process.env.MONGO_URI;
if (!uri) { const { MongoMemoryServer } = await import('mongodb-memory-server'); uri = (await MongoMemoryServer.create()).getUri(); console.log('No MONGO_URI: using in-memory MongoDB (demo)'); process.env.SEED_ON_BOOT = 'true'; }
await mongoose.connect(uri);
if (process.env.SEED_ON_BOOT === 'true' && !(await User.exists({}))) await seed();
cron.schedule('0 9 * * *', () => runReminders().catch(console.error), { timezone: 'Asia/Kolkata' }); // daily 09:00 IST
const port = process.env.PORT || 5000; buildApp().listen(port, () => console.log('API on :' + port));
