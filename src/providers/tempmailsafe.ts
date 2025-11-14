import type { IMailProvider } from '../interfaces/mail-provider.js';
import type {
  EmailMessage,
  CreateEmailRequest,
  CreateEmailResponse,
  EmailListQuery
} from '../types/email.js';
import type {
  ChannelConfiguration,
  ChannelHealth,
  ChannelStats,
  ChannelResponse,
  ChannelCapabilities,
  ChannelError
} from '../types/channel.js';
import { ChannelStatus, ChannelErrorType } from '../types/channel.js';
import { httpClient } from '../utils/http-client.js';
import { generateId } from '../utils/helpers.js';

/**
 * TempMailSafe API 响应类型
 */
interface TempMailSafeInfoResponse {
  userMailbox: string;
  mails: TempMailSafeMessage[];
  siteKey: string;
  domains: string[];
  latestBlogs: any[];
}

interface TempMailSafeMessage {
  id: string;
  messageFrom: string;
  messageTo: string;
  headers: Array<{ [key: string]: string }>;
  from: {
    name: string;
    address: string;
  };
  sender: any;
  replyTo: any;
  deliveredTo: any;
  returnPath: any;
  to: Array<{
    name: string;
    address: string;
  }>;
  cc: any[];
  bcc: any[];
  subject: string;
  messageId: string;
  inReplyTo: any;
  references: any;
  date: string;
  text: string;
  html?: string;
  createdAt: number;
  updatedAt: number;
}

/**
 * TempMailSafe 提供者实现
 * 采用 accessToken 模式，将 userMailbox Cookie 作为 accessToken 处理
 */
export class TempMailSafeProvider implements IMailProvider {
  readonly name = 'tempmailsafe';
  
  readonly capabilities: ChannelCapabilities = {
    createEmail: true,
    listEmails: true,
    getEmailContent: true,
    customDomains: true,
    customPrefix: false,
    emailExpiration: false,
    realTimeUpdates: false,
    attachmentSupport: false
  };

  private stats: ChannelStats = {
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    averageResponseTime: 0,
    errorsToday: 0,
    requestsToday: 0
  };

  private baseUrl = 'https://tempmailsafe.com';
  
  // 支持的域名列表
  private readonly domains = [
    'tempmailsafe.com',
    'ai-mcp.com'
  ];

  // 内部存储 accessToken (userMailbox Cookie)，用于向后兼容
  private sessionTokens = new Map<string, string>();

  constructor(public readonly config: ChannelConfiguration) {}

  async initialize(_config: ChannelConfiguration): Promise<void> {
    console.log('TempMailSafe provider initialized');
  }

  /**
   * 从 Set-Cookie 头中提取 userMailbox Cookie 值
   */
  private extractUserMailboxFromCookie(setCookieHeader: string | null): string {
    if (!setCookieHeader) {
      throw this.createError(
        ChannelErrorType.API_ERROR,
        'No Set-Cookie header found in response'
      );
    }

    // 解析 Set-Cookie: userMailbox=xxx; Path=/; ...
    const match = setCookieHeader.match(/userMailbox=([^;]+)/);
    if (!match) {
      throw this.createError(
        ChannelErrorType.API_ERROR,
        'userMailbox not found in Set-Cookie header'
      );
    }

    return match[1];
  }

  /**
   * 将 TempMailSafe 邮件数据映射为标准 EmailMessage 格式
   */
  private mapToEmailMessage(msg: TempMailSafeMessage): EmailMessage {
    return {
      id: msg.id,
      from: {
        email: msg.from.address,
        name: msg.from.name || undefined
      },
      to: msg.to.map(to => ({
        email: to.address,
        name: to.name || undefined
      })),
      cc: msg.cc && msg.cc.length > 0 ? msg.cc.map((cc: any) => ({
        email: cc.address,
        name: cc.name || undefined
      })) : undefined,
      bcc: msg.bcc && msg.bcc.length > 0 ? msg.bcc.map((bcc: any) => ({
        email: bcc.address,
        name: bcc.name || undefined
      })) : undefined,
      subject: msg.subject,
      textContent: msg.text,
      htmlContent: msg.html,
      receivedAt: new Date(msg.date),
      isRead: true,
      provider: this.name,
      messageId: msg.messageId
    };
  }

  /**
   * 创建临时邮箱
   * 流程：1) 发送创建请求 2) 提取 userMailbox Cookie 3) 获取邮箱地址 4) 返回 accessToken
   */
  async createEmail(request: CreateEmailRequest): Promise<ChannelResponse<CreateEmailResponse>> {
    const startTime = Date.now();

    try {
      this.updateStats('request');

      // 选择域名
      const domain = request.domain && this.domains.includes(request.domain)
        ? request.domain
        : this.domains[0];

      // 步骤1: 发送创建邮箱请求（注意：需要 ?_data=root 查询参数）
      const createResponse = await httpClient.post(
        `${this.baseUrl}/?_data=root`,
        `selectDomain=${domain}&_action=create`,
        {
          headers: {
            'content-type': 'application/x-www-form-urlencoded;charset=UTF-8'
          },
          timeout: this.config.timeout,
          retries: this.config.retries
        }
      );

      if (!createResponse.ok) {
        throw this.createError(
          ChannelErrorType.API_ERROR,
          `Failed to create email: ${createResponse.status}`,
          createResponse.status
        );
      }

      // 步骤2: 从响应头中提取 userMailbox Cookie
      const setCookieHeader = createResponse.headers.get('set-cookie');
      const userMailbox = this.extractUserMailboxFromCookie(setCookieHeader);

      // 步骤3: 使用 Cookie 获取邮箱地址
      const infoResponse = await httpClient.get<TempMailSafeInfoResponse>(
        `${this.baseUrl}/?_data=routes%2F_h._index`,
        {
          headers: {
            'Cookie': `userMailbox=${userMailbox}`
          },
          timeout: this.config.timeout,
          retries: this.config.retries
        }
      );

      if (!infoResponse.ok || !infoResponse.data.userMailbox) {
        throw this.createError(
          ChannelErrorType.API_ERROR,
          'Failed to get email address',
          infoResponse.status
        );
      }

      const address = infoResponse.data.userMailbox;
      const [username, domainPart] = address.split('@');

      // 保存 token 到内部存储（可选，用于向后兼容）
      this.sessionTokens.set(address, userMailbox);

      // 步骤4: 返回结果，将 userMailbox 作为 accessToken
      const result: CreateEmailResponse = {
        address,
        domain: domainPart,
        username,
        provider: this.name,
        accessToken: userMailbox
      };

      this.updateStats('success', Date.now() - startTime);

      return {
        success: true,
        data: result,
        metadata: {
          provider: this.name,
          responseTime: Date.now() - startTime,
          requestId: generateId()
        }
      };

    } catch (error) {
      this.updateStats('error', Date.now() - startTime);

      return {
        success: false,
        error: error instanceof Error ? error as ChannelError : this.createError(
          ChannelErrorType.UNKNOWN_ERROR,
          error instanceof Error ? error.message : String(error)
        ),
        metadata: {
          provider: this.name,
          responseTime: Date.now() - startTime,
          requestId: generateId()
        }
      };
    }
  }

  /**
   * 获取邮件列表
   * 使用 accessToken (userMailbox Cookie) 获取邮件
   */
  async getEmails(query: EmailListQuery): Promise<ChannelResponse<EmailMessage[]>> {
    const startTime = Date.now();

    try {
      this.updateStats('request');

      // 优先使用传入的 accessToken，其次使用内部存储的 token
      const userMailbox = query.accessToken || this.sessionTokens.get(query.address);
      if (!userMailbox) {
        throw this.createError(
          ChannelErrorType.AUTHENTICATION_ERROR,
          'No authentication token provided. Please provide accessToken parameter or ensure email was created through this service.'
        );
      }

      // 调用 API，将 accessToken 转换为 Cookie 头
      const response = await httpClient.get<TempMailSafeMessage[]>(
        `${this.baseUrl}/api/mails`,
        {
          headers: {
            'Cookie': `userMailbox=${userMailbox}`
          },
          timeout: this.config.timeout,
          retries: this.config.retries
        }
      );

      if (!response.ok) {
        throw this.createError(
          ChannelErrorType.API_ERROR,
          `TempMailSafe API returned ${response.status}: ${response.statusText}`,
          response.status
        );
      }

      // 转换数据格式
      const messages = Array.isArray(response.data) ? response.data : [];
      const emails: EmailMessage[] = messages.map(msg => this.mapToEmailMessage(msg));

      // 应用过滤器
      let filteredEmails = emails;
      if (query.unreadOnly) {
        filteredEmails = filteredEmails.filter(email => !email.isRead);
      }
      if (query.since) {
        filteredEmails = filteredEmails.filter(email => email.receivedAt >= query.since!);
      }

      // 应用分页
      const limit = query.limit || 20;
      const offset = query.offset || 0;
      const paginatedEmails = filteredEmails.slice(offset, offset + limit);

      this.updateStats('success', Date.now() - startTime);

      return {
        success: true,
        data: paginatedEmails,
        metadata: {
          provider: this.name,
          responseTime: Date.now() - startTime,
          requestId: generateId()
        }
      };

    } catch (error) {
      this.updateStats('error', Date.now() - startTime);

      return {
        success: false,
        error: error instanceof Error ? error as ChannelError : this.createError(
          ChannelErrorType.UNKNOWN_ERROR,
          error instanceof Error ? error.message : String(error)
        ),
        metadata: {
          provider: this.name,
          responseTime: Date.now() - startTime,
          requestId: generateId()
        }
      };
    }
  }

  /**
   * 获取邮件详情
   * TempMailSafe 在列表接口中已返回完整内容，这里从列表中查找
   */
  async getEmailContent(emailAddress: string, emailId: string, accessToken?: string): Promise<ChannelResponse<EmailMessage>> {
    const startTime = Date.now();

    try {
      this.updateStats('request');

      // 优先使用传入的 accessToken，其次使用内部存储的 token
      const userMailbox = accessToken || this.sessionTokens.get(emailAddress);
      if (!userMailbox) {
        throw this.createError(
          ChannelErrorType.AUTHENTICATION_ERROR,
          'No authentication token provided. Please provide accessToken parameter or ensure email was created through this service.'
        );
      }

      // 获取邮件列表
      const listResponse = await this.getEmails({
        address: emailAddress,
        accessToken: userMailbox
      });

      if (!listResponse.success || !listResponse.data) {
        throw this.createError(
          ChannelErrorType.API_ERROR,
          'Failed to get email list'
        );
      }

      // 从列表中查找对应的邮件
      const email = listResponse.data.find(e => e.id === emailId);
      if (!email) {
        throw this.createError(
          ChannelErrorType.API_ERROR,
          `Email with id ${emailId} not found`,
          404
        );
      }

      this.updateStats('success', Date.now() - startTime);

      return {
        success: true,
        data: email,
        metadata: {
          provider: this.name,
          responseTime: Date.now() - startTime,
          requestId: generateId()
        }
      };

    } catch (error) {
      this.updateStats('error', Date.now() - startTime);

      return {
        success: false,
        error: error instanceof Error ? error as ChannelError : this.createError(
          ChannelErrorType.UNKNOWN_ERROR,
          error instanceof Error ? error.message : String(error)
        ),
        metadata: {
          provider: this.name,
          responseTime: Date.now() - startTime,
          requestId: generateId()
        }
      };
    }
  }

  /**
   * 删除邮箱（清理本地令牌）
   */
  async deleteEmail(emailAddress: string): Promise<ChannelResponse<boolean>> {
    try {
      this.sessionTokens.delete(emailAddress);

      return {
        success: true,
        data: true,
        metadata: {
          provider: this.name,
          responseTime: 0,
          requestId: generateId()
        }
      };
    } catch (error) {
      return {
        success: false,
        error: this.createError(
          ChannelErrorType.UNKNOWN_ERROR,
          error instanceof Error ? error.message : String(error)
        ),
        metadata: {
          provider: this.name,
          responseTime: 0,
          requestId: generateId()
        }
      };
    }
  }

  /**
   * 健康检查
   */
  async getHealth(): Promise<ChannelHealth> {
    const startTime = Date.now();

    try {
      // 简单的连接测试：访问首页
      const response = await httpClient.get(this.baseUrl, {
        timeout: this.config.timeout
      });

      const responseTime = Date.now() - startTime;

      return {
        status: response.ok ? ChannelStatus.ACTIVE : ChannelStatus.ERROR,
        lastChecked: new Date(),
        responseTime,
        errorCount: this.stats.failedRequests,
        successRate: this.stats.totalRequests > 0 ?
          (this.stats.successfulRequests / this.stats.totalRequests) * 100 : 0,
        uptime: this.stats.totalRequests > 0 ?
          (this.stats.successfulRequests / this.stats.totalRequests) * 100 : 100
      };
    } catch (error) {
      return {
        status: ChannelStatus.ERROR,
        lastChecked: new Date(),
        responseTime: Date.now() - startTime,
        errorCount: this.stats.failedRequests,
        successRate: this.stats.totalRequests > 0 ?
          (this.stats.successfulRequests / this.stats.totalRequests) * 100 : 0,
        lastError: error instanceof Error ? error.message : String(error),
        uptime: this.stats.totalRequests > 0 ?
          (this.stats.successfulRequests / this.stats.totalRequests) * 100 : 100
      };
    }
  }

  /**
   * 获取统计信息
   */
  getStats(): ChannelStats {
    return { ...this.stats };
  }

  /**
   * 测试连接
   */
  async testConnection(): Promise<ChannelResponse<boolean>> {
    const startTime = Date.now();

    try {
      const response = await httpClient.get(this.baseUrl, {
        timeout: this.config.timeout
      });

      return {
        success: response.ok,
        data: response.ok,
        metadata: {
          provider: this.name,
          responseTime: Date.now() - startTime,
          requestId: generateId()
        }
      };
    } catch (error) {
      return {
        success: false,
        error: this.createError(
          ChannelErrorType.NETWORK_ERROR,
          error instanceof Error ? error.message : String(error)
        ),
        metadata: {
          provider: this.name,
          responseTime: Date.now() - startTime,
          requestId: generateId()
        }
      };
    }
  }

  /**
   * 创建错误对象
   */
  private createError(type: ChannelErrorType, message: string, statusCode?: number): ChannelError {
    const error = new Error(message) as ChannelError;
    error.type = type;
    error.channelName = this.name;
    error.statusCode = statusCode;
    error.retryable = type !== ChannelErrorType.AUTHENTICATION_ERROR && type !== ChannelErrorType.CONFIGURATION_ERROR;
    error.timestamp = new Date();
    return error;
  }

  /**
   * 更新统计信息
   */
  private updateStats(type: 'request' | 'success' | 'error', responseTime?: number): void {
    this.stats.totalRequests++;
    this.stats.requestsToday++;
    this.stats.lastRequestTime = new Date();

    if (type === 'success') {
      this.stats.successfulRequests++;
      if (responseTime) {
        this.stats.averageResponseTime =
          (this.stats.averageResponseTime + responseTime) / 2;
      }
    } else if (type === 'error') {
      this.stats.failedRequests++;
      this.stats.errorsToday++;
    }
  }
}
