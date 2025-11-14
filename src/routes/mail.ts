import { Hono, Context } from 'hono';
import { mailService } from '../services/mail-service.js';
import type { CreateEmailRequest, EmailListQuery } from '../types/email.js';

const mail = new Hono();

/**
 * 创建临时邮箱
 * POST /mail/create
 */
mail.post('/create', async (c) => {
  try {
    const body = await c.req.json() as CreateEmailRequest;

    // 验证 IMAP 配置
    if (body.provider === 'imap') {
      if (!body.imap) {
        return c.json({
          success: false,
          error: '当 provider 为 "imap" 时，imap 字段为必填',
          timestamp: new Date().toISOString()
        }, 400);
      }

      // 验证必填字段
      const required = ['domain', 'imap_server', 'imap_user', 'imap_pass'];
      for (const field of required) {
        if (!body.imap[field as keyof typeof body.imap]) {
          return c.json({
            success: false,
            error: `imap.${field} 为必填字段`,
            timestamp: new Date().toISOString()
          }, 400);
        }
      }

      // 验证邮箱格式
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(body.imap.imap_user)) {
        return c.json({
          success: false,
          error: 'imap.imap_user 必须是有效的邮箱地址',
          timestamp: new Date().toISOString()
        }, 400);
      }

      // 验证端口范围
      if (body.imap.imap_port && (body.imap.imap_port < 1 || body.imap.imap_port > 65535)) {
        return c.json({
          success: false,
          error: 'imap.imap_port 必须在 1-65535 之间',
          timestamp: new Date().toISOString()
        }, 400);
      }
    }

    const result = await mailService.createEmail(body);

    return c.json(result, result.success ? 200 : 400);
  } catch (error) {
    return c.json({
      success: false,
      error: 'Invalid request body',
      timestamp: new Date().toISOString()
    }, 400);
  }
});

/**
 * 获取邮件列表
 * POST /mail/list
 */
mail.post('/list', async (c) => {
  try {
    const body = await c.req.json() as {
      address: string;
      provider?: string;
      accessToken?: string;
      limit?: number;
      offset?: number;
      unreadOnly?: boolean;
      since?: string;
    };
    
    if (!body.address) {
      return c.json({
        success: false,
        error: 'Email address is required',
        timestamp: new Date().toISOString()
      }, 400);
    }

    const query: EmailListQuery = {
      address: body.address,
      provider: body.provider,
      accessToken: body.accessToken || c.req.header('Authorization')?.replace('Bearer ', ''),
      limit: body.limit || 20,
      offset: body.offset || 0,
      unreadOnly: body.unreadOnly === true
    };

    // 处理 since 参数
    if (body.since) {
      query.since = new Date(body.since);
    }

    const result = await mailService.getEmails(query);
    
    return c.json(result, result.success ? 200 : 400);
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Invalid request body or internal server error',
      timestamp: new Date().toISOString()
    }, 500);
  }
});

/**
 * 获取单个邮件详情
 * POST /mail/content
 */
mail.post('/content', async (c) => {
  try {
    const body = await c.req.json() as {
      address: string;
      emailId: string;
      provider?: string;
      accessToken?: string;
    };
    
    if (!body.address || !body.emailId) {
      return c.json({
        success: false,
        error: 'Email address and email ID are required',
        timestamp: new Date().toISOString()
      }, 400);
    }

    const accessToken = body.accessToken || c.req.header('Authorization')?.replace('Bearer ', '');
    const result = await mailService.getEmailContent(body.address, body.emailId, body.provider, accessToken);
    
    return c.json(result, result.success ? 200 : 404);
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Invalid request body or internal server error',
      timestamp: new Date().toISOString()
    }, 500);
  }
});



/**
 * 获取提供者健康状态
 * GET /mail/providers/health
 */
mail.get('/providers/health', async (c) => {
  try {
    const result = await mailService.getProvidersHealth();
    return c.json(result, result.success ? 200 : 500);
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
      timestamp: new Date().toISOString()
    }, 500);
  }
});

/**
 * 获取提供者统计信息
 * GET /mail/providers/stats
 */
mail.get('/providers/stats', async (c) => {
  try {
    const result = mailService.getProvidersStats();
    return c.json(result, result.success ? 200 : 500);
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
      timestamp: new Date().toISOString()
    }, 500);
  }
});

export { mail }; 