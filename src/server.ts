import { serve } from '@hono/node-server';
import app from './index.js';

const port = parseInt(process.env.PORT || '8787');

console.log(`🚀 Starting TempMailHub server on port ${port}...`);

serve({
  fetch: app.fetch,
  port
});

console.log(`✅ TempMailHub server is running at http://localhost:${port}`); 