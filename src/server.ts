import { serve } from '@hono/node-server'
import app from './index.js'
import { config } from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

// 加载 .env 文件
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const envPath = join(__dirname, '..', '.env')
config({ path: envPath })

const port = parseInt(process.env.PORT || '8787')

console.log(`🚀 Starting TempMailHub server on port ${port}...`)

serve({
  fetch: app.fetch,
  port,
})

console.log(`✅ TempMailHub server is running at http://localhost:${port}`)
