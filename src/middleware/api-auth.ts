import type { Context, Next } from 'hono'

/**
 * 从环境变量获取 API Key（仅支持 Node.js）
 */
function getApiKeyFromEnv(): string | undefined {
  if (typeof process !== 'undefined' && process.env) {
    return process.env.TEMPMAILHUB_API_KEY
  }
  return undefined
}

/**
 * 获取当前环境类型
 */
function getEnvironmentType(): string {
  if (typeof process !== 'undefined' && process.env) {
    if (process.env.NODE_ENV === 'development') {
      return 'development'
    }
    if (process.env.NODE_ENV === 'production') {
      return 'production'
    }
  }
  return 'node'
}

/**
 * 输出环境信息（调试用）
 */
function logEnvironmentInfo(): void {
  console.log('\n=== 环境信息 ===')
  console.log('- 运行时: Node.js')
  console.log('- 环境类型:', getEnvironmentType())
  console.log('- Node 版本:', process.version)
  console.log('=================\n')
}

/**
 * 显示 API Key 设置指南
 */
function showApiKeyGuide(): void {
  console.log(
    '\n🔑 API Key 未设置，如需启用认证，请设置 TEMPMAILHUB_API_KEY 环境变量：\n'
  )
  console.log(
    '   本地开发: 在 .env 文件中设置 TEMPMAILHUB_API_KEY=your-secret-key'
  )
  console.log('   生产环境: 通过环境变量设置 TEMPMAILHUB_API_KEY')
  console.log('\n')
}

// 全局变量用于控制指南显示（避免重复输出）
declare global {
  var __apiKeyGuideShown: boolean | undefined
}

/**
 * 创建带自定义错误的 API Key 认证中间件
 */
export function createApiKeyAuthWithCustomError() {
  return async (c: Context, next: Next) => {
    // 获取 API Key
    const apiKey = getApiKeyFromEnv()

    // 如果没有设置 API Key，跳过认证
    if (!apiKey) {
      // 第一次访问时显示环境信息和设置指南
      if (!globalThis.__apiKeyGuideShown) {
        logEnvironmentInfo()
        showApiKeyGuide()
        globalThis.__apiKeyGuideShown = true
      }
      console.log('⚠️  API Key 认证已禁用 - 所有接口公开访问')
      return next()
    }

    // 自定义 Bearer Token 认证逻辑
    const authHeader = c.req.header('Authorization')

    if (!authHeader?.startsWith('Bearer ')) {
      return c.json(
        {
          success: false,
          error:
            'Missing API key. Please provide Authorization header with Bearer token.',
          message: 'Authentication required',
          timestamp: new Date().toISOString(),
        },
        401
      )
    }

    const token = authHeader.replace('Bearer ', '')

    if (token !== apiKey) {
      return c.json(
        {
          success: false,
          error: 'Invalid API key. Please provide a valid Bearer token.',
          message: 'Authentication failed',
          timestamp: new Date().toISOString(),
        },
        401
      )
    }

    // 认证成功，继续处理请求
    return next()
  }
}
