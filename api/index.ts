/**
 * Vercel Serverless Function Entry Point
 * 这个文件是 Vercel 部署的入口点
 */

import { handle } from '@hono/node-server/vercel';
import app from '../src/index.js';

export default handle(app);

