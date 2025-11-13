import type { IMailProvider } from '../interfaces/mail-provider.js';
import type {
  EmailAddress,
  EmailMessage,
  CreateEmailRequest,
  CreateEmailResponse,
  EmailListQuery,
  EmailContact,
  EmailAttachment
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
import { generateId, parseDate, stripHtml } from '../utils/helpers.js';

/**
 * VanishPost API 响应类型
 */
interface VanishPostGenerateResponse {
  emailAddress: string;
  expirationDate: string;
  success: boolean;
}



interface VanishPostEmail {
  mail_id: string;
  from: string;
  fromName: string;
  fromEmail: string;
  to: string;
  subject: string;
  date: string;
  text: string;
  html: string;
  attachments: any[];
}

interface VanishPostEmailsResponse {
  emails: VanishPostEmail[];
  totalCount: number;
  page: number;
  pageSize: number;
  success: boolean;
}

/**
 * VanishPost 提供者实现
 */
export class VanishPostProvider implements IMailProvider {
  readonly name = 'vanishpost';
  
  readonly capabilities: ChannelCapabilities = {
    createEmail: true,
    listEmails: true,
    getEmailContent: true,
    customDomains: false,
    customPrefix: false,
    emailExpiration: true,
    realTimeUpdates: false,
    attachmentSupport: true
  };

  private stats: ChannelStats = {
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    averageResponseTime: 0,
    errorsToday: 0,
    requestsToday: 0
  };

  private baseUrl = 'https://vanishpost.com';
  private sessionId: string = '';

  constructor(public readonly config: ChannelConfiguration) {}

  async initialize(config: ChannelConfiguration): Promise<void> {
    // 不在初始化时生成会话ID和测试连接，延迟到第一次使用时
    // 这样避免在 Cloudflare Workers 全局作用域中使用 crypto.getRandomValues
    console.log('VanishPost provider initialized (session and connection will be established on first use)');
  }

  async createEmail(request: CreateEmailRequest): Promise<ChannelResponse<CreateEmailResponse>> {
    const startTime = Date.now();
    
    try {
      this.updateStats('request');

      // 生成session ID（如果还没有）
      if (!this.sessionId) {
        this.sessionId = this.generateSessionId();
      }

      const response = await httpClient.post<VanishPostGenerateResponse>(
        `${this.baseUrl}/api/generate`,
        '',
        {
          headers: {
            'accept': '*/*',
            'accept-language': 'zh-CN,zh;q=0.9',
            'content-length': '0',
            'content-type': 'application/json',
            'origin': this.baseUrl,
            'referer': `${this.baseUrl}/`,
            'session-id': this.sessionId,
            'x-session-id': this.sessionId,
            'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36'
          },
          timeout: this.config.timeout,
          retries: this.config.retries
        }
      );

      if (!response.ok) {
        if (response.status === 429) {
          throw this.createError(
            ChannelErrorType.RATE_LIMIT_ERROR,
            'VanishPost 速率限制：每个IP地址15分钟内只能创建1个邮箱。请等待15分钟后重试，或使用其他邮箱提供商（如 mailtm、minmail 等）。',
            response.status
          );
        }
        throw this.createError(
          ChannelErrorType.API_ERROR,
          `VanishPost API returned ${response.status}: ${response.statusText}`,
          response.status
        );
      }

      const data = response.data;
      if (!data.success || !data.emailAddress) {
        throw this.createError(
          ChannelErrorType.API_ERROR,
          'Failed to generate email address'
        );
      }

      const [username, domain] = data.emailAddress.split('@');
      const expiresAt = new Date(data.expirationDate);

      const result: CreateEmailResponse = {
        address: data.emailAddress,
        domain,
        username,
        expiresAt,
        provider: this.name
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

  async getEmails(query: EmailListQuery): Promise<ChannelResponse<EmailMessage[]>> {
    const startTime = Date.now();
    
    try {
      this.updateStats('request');

      const encodedEmail = encodeURIComponent(query.address);
      const response = await httpClient.get<VanishPostEmailsResponse>(
        `${this.baseUrl}/api/emails/${encodedEmail}`,
        {
          headers: {
            'accept': '*/*',
            'accept-language': 'zh-CN,zh;q=0.9',
            'referer': `${this.baseUrl}/`,
            'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36'
          },
          timeout: this.config.timeout,
          retries: this.config.retries
        }
      );

      if (!response.ok) {
        throw this.createError(
          ChannelErrorType.API_ERROR,
          `VanishPost API returned ${response.status}: ${response.statusText}`,
          response.status
        );
      }

      const data = response.data;
      if (!data.success) {
        throw this.createError(
          ChannelErrorType.API_ERROR,
          'Failed to get emails'
        );
      }

      const messages = data.emails || [];
      const emails: EmailMessage[] = messages.map(msg => this.mapToEmailMessage(msg, query.address));

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

  async getEmailContent(emailAddress: string, emailId: string, accessToken?: string): Promise<ChannelResponse<EmailMessage>> {
    // VanishPost 的邮件列表接口已经包含完整内容，所以直接从列表中查找
    const emailsResponse = await this.getEmails({ address: emailAddress });
    
    if (!emailsResponse.success) {
      return {
        success: false,
        error: emailsResponse.error,
        metadata: emailsResponse.metadata
      };
    }

    const email = emailsResponse.data?.find(msg => msg.id === emailId);
    if (!email) {
      return {
        success: false,
        error: this.createError(ChannelErrorType.API_ERROR, `Email with ID ${emailId} not found`),
        metadata: {
          provider: this.name,
          responseTime: 0,
          requestId: generateId()
        }
      };
    }

    return {
      success: true,
      data: email,
      metadata: {
        provider: this.name,
        responseTime: 0,
        requestId: generateId()
      }
    };
  }



  async getHealth(): Promise<ChannelHealth> {
    const testResult = await this.testConnection();
    
    return {
      status: testResult.success ? ChannelStatus.ACTIVE : ChannelStatus.ERROR,
      lastChecked: new Date(),
      responseTime: testResult.metadata.responseTime,
      errorCount: this.stats.failedRequests,
      successRate: this.stats.totalRequests > 0 ? 
        (this.stats.successfulRequests / this.stats.totalRequests) * 100 : 0,
      lastError: testResult.error?.message,
      uptime: this.stats.totalRequests > 0 ? 
        (this.stats.successfulRequests / this.stats.totalRequests) * 100 : 100
    };
  }

  getStats(): ChannelStats {
    return { ...this.stats };
  }

  async testConnection(): Promise<ChannelResponse<boolean>> {
    const startTime = Date.now();
    
    try {
      const response = await httpClient.get(`${this.baseUrl}/`, {
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

  private generateSessionId(): string {
    // 兼容不同环境的随机ID生成
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      return Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join('');
    } else {
      // 后备方案
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
      });
    }
  }

  private mapToEmailMessage(msg: VanishPostEmail, emailAddress: string): EmailMessage {
    const attachments: EmailAttachment[] = (msg.attachments || []).map((att, index) => ({
      id: String(index),
      filename: att.filename || `attachment_${index}`,
      contentType: att.contentType || 'application/octet-stream',
      size: att.size || 0,
      inline: att.inline || false
    }));

    return {
      id: msg.mail_id,
      from: {
        email: msg.fromEmail,
        name: msg.fromName || undefined
      },
      to: [{
        email: emailAddress
      }],
      subject: msg.subject,
      textContent: msg.text,
      htmlContent: msg.html,
      receivedAt: parseDate(msg.date),
      isRead: false, // VanishPost 没有已读状态
      provider: this.name,
      attachments: attachments.length > 0 ? attachments : undefined
    };
  }

  private createError(type: ChannelErrorType, message: string, statusCode?: number): ChannelError {
    const error = new Error(message) as ChannelError;
    error.type = type;
    error.channelName = this.name;
    error.statusCode = statusCode;
    error.retryable = type !== ChannelErrorType.AUTHENTICATION_ERROR && type !== ChannelErrorType.CONFIGURATION_ERROR;
    error.timestamp = new Date();
    return error;
  }

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