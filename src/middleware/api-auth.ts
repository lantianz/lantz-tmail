import { bearerAuth } from 'hono/bearer-auth';
import { env, getRuntimeKey } from 'hono/adapter';
import type { Context, Next } from 'hono';

export interface AuthConfig {
  apiKey?: string;
  enabled: boolean;
}

/**
 * 从环境变量获取认证配置
 * 优先使用 Hono 官方的跨运行时 env() 函数，提供 fallback 确保兼容性
 */
export function getAuthConfig(bindingEnv?: any): AuthConfig {
  // 1. Cloudflare Workers环境 (通过env参数 - 保持原有方式)
  if (bindingEnv && typeof bindingEnv === 'object' && bindingEnv.TEMPMAILHUB_API_KEY) {
    return {
      apiKey: bindingEnv.TEMPMAILHUB_API_KEY,
      enabled: !!bindingEnv.TEMPMAILHUB_API_KEY
    };
  }
  
  // 2. 对于其他平台，需要在实际的请求处理中使用 env(c) 获取
  // 这里返回默认值，实际值在请求时确定
  return {
    enabled: false, // 默认值，实际值在请求时确定
    apiKey: undefined
  };
}

/**
 * 使用 Hono 官方的跨运行时方式获取环境变量
 */
function getApiKeyFromContext(c: Context): { apiKey: string | undefined; platform: string } {
  // 1. 优先处理 Cloudflare Workers 环境 (通过 c.env)
  if (c.env && typeof c.env === 'object' && (c.env as any).TEMPMAILHUB_API_KEY) {
    return {
      apiKey: (c.env as any).TEMPMAILHUB_API_KEY,
      platform: 'cloudflare'
    };
  }
  
  try {
    // 2. 使用 Hono 官方的 env() 函数（支持其他运行时）
    const envVars = env<{
      TEMPMAILHUB_API_KEY?: string;
      VERCEL?: string;
      NETLIFY?: string;
      NODE_ENV?: string;
    }>(c);
    
    const apiKey = envVars.TEMPMAILHUB_API_KEY;
    const runtime = getRuntimeKey();
    
    // 根据运行时和环境变量判断平台
    let platform: string = runtime;
    if (envVars.VERCEL) {
      platform = 'vercel';
    } else if (envVars.NETLIFY) {
      platform = 'netlify';
    } else if (envVars.NODE_ENV === 'development') {
      platform = 'development';
    }
    
    return { apiKey, platform };
  } catch (error) {
    console.warn('获取环境变量失败，使用 fallback 方式:', error);
    
    // 3. Fallback: 手动检测（保持向后兼容）
    return getFallbackApiKey();
  }
}

/**
 * Fallback 方式获取环境变量（向后兼容）
 */
function getFallbackApiKey(): { apiKey: string | undefined; platform: string } {
  let apiKey: string | undefined;
  let platform = 'unknown';
  
  try {
    // 检测 Deno 环境
    if (typeof globalThis !== 'undefined' && (globalThis as any).Deno?.env) {
      try {
        apiKey = (globalThis as any).Deno.env.get('TEMPMAILHUB_API_KEY');
        platform = 'deno';
      } catch (denoError) {
        console.warn('Deno env access error (需要 --allow-env 权限):', denoError);
      }
    }
    
    // 检测 Node.js 环境
    if (!apiKey && typeof globalThis !== 'undefined' && (globalThis as any).process?.env) {
      const processEnv = (globalThis as any).process.env;
      apiKey = processEnv.TEMPMAILHUB_API_KEY;
      
      if (processEnv.VERCEL) {
        platform = 'vercel';
      } else if (processEnv.NETLIFY) {
        platform = 'netlify';
      } else if (processEnv.NODE_ENV === 'development') {
        platform = 'development';
      } else {
        platform = 'node';
      }
    }
  } catch (error) {
    console.warn('Fallback 环境变量获取失败:', error);
  }
  
  return { apiKey, platform };
}

/**
 * 输出环境信息（调试用）
 */
function logEnvironmentInfo(c: Context): void {
  console.log('\n=== 环境信息 ===');
  
  try {
    // 检查是否为 Cloudflare Workers
    if (c.env && typeof c.env === 'object') {
      console.log('- 运行时: cloudflare');
      console.log('- Cloudflare Workers: true');
      console.log('=================\n');
      return;
    }
    
    // 其他运行时使用 Hono 的方式
    const runtime = getRuntimeKey();
    console.log('- 运行时:', runtime);
    
    const envVars = env<{
      VERCEL?: string;
      NETLIFY?: string;
      NODE_ENV?: string;
    }>(c);
    
    console.log('- Vercel平台:', !!envVars.VERCEL);
    console.log('- Netlify平台:', !!envVars.NETLIFY);
    console.log('- 开发环境:', envVars.NODE_ENV === 'development');
  } catch (error) {
    console.log('- 环境信息获取失败:', error);
  }
  
  console.log('=================\n');
}

/**
 * 显示 API Key 设置指南
 */
function showApiKeyGuide(platform: string): void {
  console.log('\n🔑 API Key 未设置，如需启用认证，请设置 TEMPMAILHUB_API_KEY 环境变量：\n');
  
  switch (platform) {
    case 'cloudflare':
    case 'workerd':
      console.log('   Cloudflare Workers: 在 Dashboard 的 Workers & Pages > 你的项目 > Settings > Environment Variables 中设置');
      break;
    case 'vercel':
      console.log('   Vercel: vercel env add TEMPMAILHUB_API_KEY');
      break;
    case 'netlify':
      console.log('   Netlify: 在 Dashboard 的 Site settings > Environment variables 中设置');
      break;
    case 'deno':
      console.log('   Deno Deploy: 在 Dashboard 的 Settings > Environment Variables 中设置');
      break;
    case 'node':
    case 'bun':
    case 'development':
    default:
      console.log('   本地开发: 在 .env 文件中设置 TEMPMAILHUB_API_KEY=your-secret-key');
      console.log('   生产环境: 通过环境变量设置');
      break;
  }
  
  console.log('\n');
}

// 全局变量用于控制指南显示（避免重复输出）
declare global {
  var __apiKeyGuideShown: boolean | undefined;
}

/**
 * 创建带自定义错误的 API Key 认证中间件
 */
export function createApiKeyAuthWithCustomError() {
  return async (c: Context, next: Next) => {
    // 优先使用原有方式支持 Cloudflare Workers（向后兼容）
    const config = getAuthConfig(c.env);
    
    if (config.enabled) {
      // Cloudflare Workers 环境，使用原有的认证逻辑
      const authHeader = c.req.header('Authorization');
      
      if (!authHeader?.startsWith('Bearer ')) {
        return c.json({
          success: false,
          error: 'Missing API key. Please provide Authorization header with Bearer token.',
          message: 'Authentication required',
          timestamp: new Date().toISOString()
        }, 401);
      }
      
      const token = authHeader.replace('Bearer ', '');
      
      if (token !== config.apiKey) {
        return c.json({
          success: false,
          error: 'Invalid API key. Please provide a valid Bearer token.',
          message: 'Authentication failed',
          timestamp: new Date().toISOString()
        }, 401);
      }
      
      return next();
    }
    
    // 对于其他平台，使用跨运行时方式
    const { apiKey, platform } = getApiKeyFromContext(c);
    
    // 如果没有设置 API Key，跳过认证
    if (!apiKey) {
      // 第一次访问时显示环境信息和设置指南
      if (!globalThis.__apiKeyGuideShown) {
        logEnvironmentInfo(c);
        showApiKeyGuide(platform);
        globalThis.__apiKeyGuideShown = true;
      }
      
      console.log('⚠️  API Key 认证已禁用 - 所有接口公开访问');
      return next();
    }
    
    // 使用 Hono 的 bearerAuth 中间件
    const auth = bearerAuth({
      token: apiKey,
      realm: 'TempMailHub API',
      invalidTokenMessage: {
        success: false,
        error: 'Invalid API key. Please provide a valid Bearer token.',
        message: 'Authentication failed',
        timestamp: new Date().toISOString()
      },
      noAuthenticationHeaderMessage: {
        success: false,
        error: 'Missing API key. Please provide Authorization header with Bearer token.',
        message: 'Authentication required',
        timestamp: new Date().toISOString()
      }
    });
    
    return auth(c, next);
  };
} 