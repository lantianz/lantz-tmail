/**
 * TempMailHub - 临时邮件网关服务
 * 基于 Hono 框架的多平台临时邮箱聚合服务
 */

// 首先加载环境变量
import { config } from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const envPath = join(__dirname, '..', '.env')
config({ path: envPath })

import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { prettyJSON } from 'hono/pretty-json'
import { initializeProviders, providerManager } from './providers/index.js'
import { mailService } from './services/mail-service.js'
import { createApiKeyAuthWithCustomError } from './middleware/api-auth.js'
import { readFileSync } from 'fs'
import { configManager } from './config/index.js'

// 加载环境变量配置
configManager.loadFromEnv()

// 读取主页 HTML 文件
const homeHtml = readFileSync(join(__dirname, 'views', 'home.html'), 'utf-8')

// 基础类型定义
interface AppResponse {
  success: boolean
  data?: any
  message?: string
  error?: string
  timestamp: string
  provider?: string
}

// 创建 Hono 应用实例
const app = new Hono()

// 全局中间件
app.use('*', cors())
app.use('*', logger())
app.use('/api/*', prettyJSON())

// 创建API Key验证中间件
const apiKeyAuth = createApiKeyAuthWithCustomError()

// 应用初始化状态
// 在应用启动时初始化providers（仅包含基本配置，不进行网络调用）
console.log('🚀 Starting TempMailHub initialization...')
await initializeProviders()
console.log('✅ TempMailHub initialized successfully')

// 主页路由
app.get('/', (c) => {
  return c.html(homeHtml)
})

// 健康检查路由
app.get('/health', (c) => {
  const response: AppResponse = {
    success: true,
    message: 'TempMailHub is running',
    data: {
      version: '1.0.0',
      status: 'healthy',
      uptime:
        typeof globalThis !== 'undefined' && (globalThis as any).process?.uptime
          ? (globalThis as any).process.uptime()
          : 0,
    },
    timestamp: new Date().toISOString(),
  }

  return c.json(response)
})

// API 信息路由
app.get('/api/info', (c) => {
  // 获取所有已启用的渠道
  const enabledProviders = providerManager.getEnabledProviders()

  // 定义所有渠道的详细信息
  const allProvidersInfo: Record<
    string,
    { id: string; name: string; domains: string[]; customizable: boolean }
  > = {
    minmail: {
      id: 'minmail',
      name: 'MinMail',
      domains: ['atminmail.com'],
      customizable: false,
    },
    tempmailplus: {
      id: 'tempmailplus',
      name: 'TempMail Plus',
      domains: [
        'mailto.plus',
        'fexpost.com',
        'fexbox.org',
        'mailbox.in.ua',
        'rover.info',
        'chitthi.in',
        'fextemp.com',
        'any.pink',
        'merepost.com',
      ],
      customizable: true,
    },
    mailtm: {
      id: 'mailtm',
      name: 'Mail.tm',
      domains: ['somoj.com'],
      customizable: false,
    },
    etempmail: {
      id: 'etempmail',
      name: 'EtempMail',
      domains: ['cross.edu.pl', 'ohm.edu.pl', 'usa.edu.pl', 'beta.edu.pl'],
      customizable: false,
    },
    vanishpost: {
      id: 'vanishpost',
      name: 'VanishPost',
      domains: ['服务端分配'],
      customizable: false,
    },
    tempmailsafe: {
      id: 'tempmailsafe',
      name: 'TempMailSafe',
      domains: ['tempmailsafe.com', 'ai-mcp.com'],
      customizable: true,
    },
    imap: {
      id: 'imap',
      name: 'IMAP',
      domains: [],
      customizable: true,
    },
  }

  // 只返回已启用的渠道信息
  const enabledProvidersInfo = enabledProviders
    .map((provider) => allProvidersInfo[provider.name])
    .filter((info) => info !== undefined)

  const response: AppResponse = {
    success: true,
    data: {
      name: 'lantz-tmail',
      version: '2.0.0',
      description: '开源的临时邮件 API 服务 - 聚合多个邮箱服务商',
      deployment: {
        supported: ['Node.js', 'Docker', 'Vercel'],
        current: 'Node.js',
      },
      providers: enabledProvidersInfo,
      authentication: {
        enabled: !!process.env.TEMPMAILHUB_API_KEY,
        method: 'Bearer Token',
        header: 'Authorization: Bearer <api-key>',
        note: process.env.TEMPMAILHUB_API_KEY
          ? 'API Key authentication is enabled. Protected endpoints require valid API key.'
          : 'API Key authentication is disabled. All endpoints are publicly accessible.',
      },
      endpoints: {
        public: [
          'GET /health - 健康检查',
          'GET /api/info - API 信息',
          'POST /api/mail/providers/test-connections - 测试所有提供者连接',
          'GET /api/mail/providers/stats - 提供者统计信息',
        ],
        protected: [
          'POST /api/mail/create - 创建临时邮箱',
          'POST /api/mail/list - 获取邮件列表',
          'POST /api/mail/content - 获取邮件详情',
        ],
      },
    },
    timestamp: new Date().toISOString(),
  }

  return c.json(response)
})

// 创建邮箱路由
app.post('/api/mail/create', apiKeyAuth, async (c) => {
  try {
    let body = {}

    try {
      body = await c.req.json()
    } catch (error) {
      // 如果没有body或解析失败，使用默认空对象
    }

    const result = await mailService.createEmail(body)

    return c.json(result, result.success ? 200 : 400)
  } catch (error) {
    const response: AppResponse = {
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
      timestamp: new Date().toISOString(),
    }

    return c.json(response, 500)
  }
})

// 获取邮件列表路由 (POST)
app.post('/api/mail/list', apiKeyAuth, async (c) => {
  try {
    const body = await c.req.json()

    if (!body.address) {
      return c.json(
        {
          success: false,
          error: 'Email address is required',
          timestamp: new Date().toISOString(),
        },
        400
      )
    }

    // 只从请求体中获取accessToken，避免与API Key认证冲突
    const accessToken = body.accessToken

    const query = {
      address: body.address,
      provider: body.provider,
      accessToken,
      limit: body.limit || 20,
      offset: body.offset || 0,
      unreadOnly: body.unreadOnly === true,
      since: body.since ? new Date(body.since) : undefined,
    }

    const result = await mailService.getEmails(query)

    return c.json(result, result.success ? 200 : 400)
  } catch (error) {
    const response: AppResponse = {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : 'Invalid request body or internal server error',
      timestamp: new Date().toISOString(),
    }

    return c.json(response, 500)
  }
})

// 获取邮件详情路由 (POST)
app.post('/api/mail/content', apiKeyAuth, async (c) => {
  try {
    const body = await c.req.json()

    if (!body.address || !body.id) {
      return c.json(
        {
          success: false,
          error: 'Email address and email ID are required',
          timestamp: new Date().toISOString(),
        },
        400
      )
    }

    // 只从请求体中获取accessToken，避免与API Key认证冲突
    const accessToken = body.accessToken

    const result = await mailService.getEmailContent(
      body.address,
      body.id,
      body.provider,
      accessToken
    )

    return c.json(result, result.success ? 200 : 404)
  } catch (error) {
    const response: AppResponse = {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : 'Invalid request body or internal server error',
      timestamp: new Date().toISOString(),
    }

    return c.json(response, 500)
  }
})

// 强制测试所有provider连接状态
app.post('/api/mail/providers/test-connections', async (c) => {
  try {
    // 强制重新测试所有provider的连接
    const result = await mailService.getProvidersHealth()

    return c.json({
      success: true,
      message: 'All providers tested',
      data: result.data,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    return c.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Failed to test provider connections',
        timestamp: new Date().toISOString(),
      },
      500
    )
  }
})

// 提供者统计信息路由
app.get('/api/mail/providers/stats', (c) => {
  try {
    const result = mailService.getProvidersStats()
    return c.json(result, result.success ? 200 : 500)
  } catch (error) {
    const response: AppResponse = {
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
      timestamp: new Date().toISOString(),
    }

    return c.json(response, 500)
  }
})

// 404 处理
app.notFound((c) => {
  return c.json(
    {
      success: false,
      error: 'Endpoint not found',
      timestamp: new Date().toISOString(),
    },
    404
  )
})

// 错误处理
app.onError((err, c) => {
  console.error('Application error:', err)
  return c.json(
    {
      success: false,
      error: 'Internal server error',
      timestamp: new Date().toISOString(),
    },
    500
  )
})

// 导出应用实例
export default app
