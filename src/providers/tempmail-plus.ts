import type { IMailProvider } from '../interfaces/mail-provider.js';
import type {
  EmailAddress,
  EmailMessage,
  CreateEmailRequest,
  CreateEmailResponse,
  EmailListQuery,
  EmailContact
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
import { generateId, generateEmailPrefix, parseDate, stripHtml } from '../utils/helpers.js';

/**
 * TempMail Plus API 响应类型
 */
interface TempMailPlusListResponse {
  count: number;
  first_id: number;
  last_id: number;
  limit: number;
  mail_list: TempMailPlusMessage[];
  more: boolean;
  result: boolean;
}

interface TempMailPlusMessage {
  attachment_count: number;
  first_attachment_name: string;
  from_mail: string;
  from_name: string;
  is_new: boolean;
  mail_id: number;
  subject: string;
  time: string;
}

interface TempMailPlusEmailDetail {
  attachments: any[];
  date: string;
  from: string;
  from_is_local: boolean;
  from_mail: string;
  from_name: string;
  html: string;
  is_tls: boolean;
  mail_id: number;
  message_id: string;
  result: boolean;
  subject: string;
  text: string;
  to: string;
}

/**
 * TempMail Plus 提供者实现
 */
export class TempMailPlusProvider implements IMailProvider {
  readonly name = 'tempmailplus';
  
  readonly capabilities: ChannelCapabilities = {
    createEmail: true,
    listEmails: true,
    getEmailContent: true,
    customDomains: true,
    customPrefix: true,
    emailExpiration: false,
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

  // 支持的域名列表
  private readonly domains = [
    'mailto.plus',
    'fexpost.com',
    'fexbox.org',
    'mailbox.in.ua',
    'rover.info',
    'chitthi.in',
    'fextemp.com',
    'any.pink',
    'merepost.com'
  ];

  constructor(public readonly config: ChannelConfiguration) {}

  async initialize(config: ChannelConfiguration): Promise<void> {
    console.log('TempMail Plus provider initialized (connection will be tested on first use)');
  }

  async createEmail(request: CreateEmailRequest): Promise<ChannelResponse<CreateEmailResponse>> {
    const startTime = Date.now();
    
    try {
      this.updateStats('request');

      // TempMail Plus 不提供创建邮箱的API，我们生成一个随机邮箱
      const prefix = request.prefix || generateEmailPrefix(8);
      const domain = request.domain && this.domains.includes(request.domain) 
        ? request.domain 
        : this.domains[Math.floor(Math.random() * this.domains.length)];
      
      const address = `${prefix}@${domain}`;
      const [username, domainPart] = address.split('@');

      const result: CreateEmailResponse = {
        address,
        domain: domainPart,
        username,
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
      const limit = query.limit || 20;
      const url = `https://tempmail.plus/api/mails?email=${encodedEmail}&limit=${limit}&epin=`;

      const response = await httpClient.get<TempMailPlusListResponse>(url, {
        headers: {
          'accept': 'application/json, text/javascript, */*; q=0.01',
          'accept-language': 'zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7',
          'referer': 'https://tempmail.plus/zh/',
          'x-requested-with': 'XMLHttpRequest',
          'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36'
        },
        timeout: this.config.timeout,
        retries: this.config.retries
      });

      if (!response.ok) {
        throw this.createError(
          ChannelErrorType.API_ERROR,
          `TempMail Plus API returned ${response.status}: ${response.statusText}`,
          response.status
        );
      }

      const data = response.data;
      if (!data.result) {
        throw this.createError(
          ChannelErrorType.API_ERROR,
          'TempMail Plus API returned unsuccessful result'
        );
      }

      const messages = data.mail_list || [];
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
    const startTime = Date.now();
    
    try {
      this.updateStats('request');

      const encodedEmail = encodeURIComponent(emailAddress);
      const url = `https://tempmail.plus/api/mails/${emailId}?email=${encodedEmail}&epin=`;

      const response = await httpClient.get<TempMailPlusEmailDetail>(url, {
        headers: {
          'accept': 'application/json, text/javascript, */*; q=0.01',
          'accept-language': 'zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7',
          'referer': 'https://tempmail.plus/zh/',
          'x-requested-with': 'XMLHttpRequest',
          'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36'
        },
        timeout: this.config.timeout,
        retries: this.config.retries
      });

      if (!response.ok) {
        throw this.createError(
          ChannelErrorType.API_ERROR,
          `TempMail Plus API returned ${response.status}: ${response.statusText}`,
          response.status
        );
      }

      const data = response.data;
      if (!data.result) {
        throw this.createError(
          ChannelErrorType.API_ERROR,
          'Email not found or API error'
        );
      }

      const email = this.mapDetailToEmailMessage(data, emailAddress);

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
      // 测试获取一个假邮箱的邮件列表
      const testEmail = `test123@${this.domains[0]}`;
      const encodedEmail = encodeURIComponent(testEmail);
      const response = await httpClient.get(
        `https://tempmail.plus/api/mails?email=${encodedEmail}&limit=1&epin=`,
        {
          timeout: this.config.timeout
        }
      );

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

  private mapToEmailMessage(msg: TempMailPlusMessage, emailAddress: string): EmailMessage {
    return {
      id: String(msg.mail_id),
      from: {
        email: msg.from_mail,
        name: msg.from_name || undefined
      },
      to: [{
        email: emailAddress
      }],
      subject: msg.subject,
      textContent: '', // 需要单独获取详情
      htmlContent: '', // 需要单独获取详情
      receivedAt: parseDate(msg.time),
      isRead: !msg.is_new,
      provider: this.name,
      attachments: msg.attachment_count > 0 ? [] : undefined // 标记有附件但不在列表中提供详情
    };
  }

  private mapDetailToEmailMessage(detail: TempMailPlusEmailDetail, emailAddress: string): EmailMessage {
    return {
      id: String(detail.mail_id),
      from: {
        email: detail.from_mail,
        name: detail.from_name || undefined
      },
      to: [{
        email: emailAddress
      }],
      subject: detail.subject,
      textContent: detail.text,
      htmlContent: detail.html,
      receivedAt: parseDate(detail.date),
      isRead: true,
      provider: this.name,
      messageId: detail.message_id,
      attachments: detail.attachments || [],
      headers: {
        'Message-ID': detail.message_id,
        'From': detail.from,
        'To': detail.to,
        'Date': detail.date
      }
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