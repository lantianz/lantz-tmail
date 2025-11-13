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
import { generateId, parseDate, stripHtml } from '../utils/helpers.js';

/**
 * EtempMail API 响应类型
 */
interface EtempMailAddressResponse {
  id: string;
  address: string;
  creation_time: string;
  recover_key: string;
}

interface EtempMailInboxMessage {
  subject: string;
  from: string;
  date: string;
  body: string;
}

/**
 * EtempMail 提供者实现
 */
export class EtempMailProvider implements IMailProvider {
  readonly name = 'etempmail';
  
  readonly capabilities: ChannelCapabilities = {
    createEmail: true,
    listEmails: true,
    getEmailContent: true,
    customDomains: true, // 支持指定域名（通过 changeEmailAddress 接口）
    customPrefix: false,
    emailExpiration: true,
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

  private baseUrl = 'https://etempmail.com';
  private sessionId: string = '';
  
  // 支持的域名列表和对应的ID
  private readonly domains = [
    'cross.edu.pl',
    'ohm.edu.pl', 
    'usa.edu.pl',
    'beta.edu.pl'
  ];

  // 域名ID映射表
  private readonly domainIdMapping: Record<string, string> = {
    'ohm.edu.pl': '21',
    'cross.edu.pl': '20', 
    'usa.edu.pl': '19',
    'beta.edu.pl': '18'
  };

  constructor(public readonly config: ChannelConfiguration) {}

  async initialize(config: ChannelConfiguration): Promise<void> {
    console.log('EtempMail provider initialized (server time and connection will be tested on first use)');
  }

  async createEmail(request: CreateEmailRequest): Promise<ChannelResponse<CreateEmailResponse>> {
    const startTime = Date.now();
    
    try {
      this.updateStats('request');

      // 确保有会话
      if (!this.sessionId) {
        await this.getServerTime();
      }

      // 处理域名选择
      if (request.domain && this.domainIdMapping[request.domain]) {
        // 用户指定了域名
        await this.changeEmailAddress(this.domainIdMapping[request.domain]);
      } else if (!request.domain) {
        // 用户没有指定域名，随机选择一个
        const domainIds = Object.values(this.domainIdMapping);
        const randomId = domainIds[Math.floor(Math.random() * domainIds.length)];
        await this.changeEmailAddress(randomId);
      }

      const response = await httpClient.post<EtempMailAddressResponse>(
        `${this.baseUrl}/getEmailAddress`,
        '',
        {
          headers: {
            'accept': '*/*',
            'accept-language': 'zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7',
            'content-length': '0',
            'origin': this.baseUrl,
            'referer': `${this.baseUrl}/`,
            'x-requested-with': 'XMLHttpRequest',
            'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
            'cookie': `ci_session=${this.sessionId}`
          },
          timeout: this.config.timeout,
          retries: this.config.retries
        }
      );

      if (!response.ok) {
        throw this.createError(
          ChannelErrorType.API_ERROR,
          `EtempMail API returned ${response.status}: ${response.statusText}`,
          response.status
        );
      }

      const data = response.data;
      if (!data.address) {
        throw this.createError(
          ChannelErrorType.API_ERROR,
          'Invalid response from EtempMail API: missing address'
        );
      }

      const [username, domain] = data.address.split('@');
      const creationTime = parseInt(data.creation_time) * 1000; // 转换为毫秒
      const expiresAt = new Date(creationTime + 15 * 60 * 1000); // 15分钟后过期

      const result: CreateEmailResponse = {
        address: data.address,
        domain,
        username,
        expiresAt,
        provider: this.name,
        recoveryKey: data.recover_key
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

      // 确保有会话
      if (!this.sessionId) {
        await this.getServerTime();
      }

      const response = await httpClient.post<EtempMailInboxMessage[]>(
        `${this.baseUrl}/getInbox`,
        '',
        {
          headers: {
            'accept': '*/*',
            'accept-language': 'zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7',
            'content-length': '0',
            'origin': this.baseUrl,
            'referer': `${this.baseUrl}/`,
            'x-requested-with': 'XMLHttpRequest',
            'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
            'cookie': `ci_session=${this.sessionId}`
          },
          timeout: this.config.timeout,
          retries: this.config.retries
        }
      );

      if (!response.ok) {
        throw this.createError(
          ChannelErrorType.API_ERROR,
          `EtempMail API returned ${response.status}: ${response.statusText}`,
          response.status
        );
      }

      const messages = Array.isArray(response.data) ? response.data : [];
      const emails: EmailMessage[] = messages.map((msg, index) => this.mapToEmailMessage(msg, query.address, index));

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
    // EtempMail 的 getInbox 接口已经包含完整内容，所以直接从列表中查找
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
      const response = await httpClient.post(`${this.baseUrl}/getServerTime`, '', {
        headers: {
          'content-length': '0',
          'origin': this.baseUrl,
          'referer': `${this.baseUrl}/`
        },
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

  private async getServerTime(): Promise<void> {
    try {
      const response = await httpClient.post(`${this.baseUrl}/getServerTime`, '', {
        headers: {
          'accept': '*/*',
          'accept-language': 'zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7',
          'content-length': '0',
          'origin': this.baseUrl,
          'referer': `${this.baseUrl}/`,
          'sec-ch-ua': '"Not)A;Brand";v="8", "Chromium";v="138", "Google Chrome";v="138"',
          'sec-ch-ua-mobile': '?0',
          'sec-ch-ua-platform': '"macOS"',
          'sec-fetch-dest': 'empty',
          'sec-fetch-mode': 'cors',
          'sec-fetch-site': 'same-origin',
          'sec-gpc': '1',
          'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
          'x-requested-with': 'XMLHttpRequest'
        }
      });

      if (response.ok) {
        // 从 Set-Cookie 头中提取会话ID，要包含完整的cookie信息
        const cookies = response.headers.get('set-cookie');
        if (cookies) {
          const sessionMatch = cookies.match(/ci_session=([^;]+)/);
          if (sessionMatch) {
            this.sessionId = sessionMatch[1];
          }
        }
        
        // 如果没有获取到session，生成一个假的
        if (!this.sessionId) {
          this.sessionId = '51sutdevslriv5ft7mdqkats3a9l5bd6'; // 示例session
        }
      }
    } catch (error) {
      // 使用默认会话ID
      this.sessionId = '51sutdevslriv5ft7mdqkats3a9l5bd6';
    }
  }

  private async changeEmailAddress(domainId: string): Promise<void> {
    try {
      const response = await httpClient.post(
        `${this.baseUrl}/changeEmailAddress`,
        `id=${domainId}`,
        {
          headers: {
            'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
            'accept-language': 'zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7',
            'cache-control': 'max-age=0',
            'content-type': 'application/x-www-form-urlencoded',
            'origin': this.baseUrl,
            'referer': `${this.baseUrl}/zh`,
            'sec-ch-ua': '"Not)A;Brand";v="8", "Chromium";v="138", "Google Chrome";v="138"',
            'sec-ch-ua-mobile': '?0',
            'sec-ch-ua-platform': '"macOS"',
            'sec-fetch-dest': 'document',
            'sec-fetch-mode': 'navigate',
            'sec-fetch-site': 'same-origin',
            'sec-fetch-user': '?1',
            'sec-gpc': '1',
            'upgrade-insecure-requests': '1',
            'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
            'cookie': `ci_session=${this.sessionId}`
          },
          timeout: this.config.timeout
        }
      );
      
      // 返回307重定向是正常的，表示域名设置成功
      if (response.status === 307 || response.ok) {
        console.log(`EtempMail domain changed to ID: ${domainId}`);
      }
    } catch (error) {
      console.warn(`Failed to change EtempMail domain: ${error}`);
      // 不抛出错误，继续使用默认域名
    }
  }

  private mapToEmailMessage(msg: EtempMailInboxMessage, emailAddress: string, index: number): EmailMessage {
    return {
      id: String(index), // EtempMail 没有提供邮件ID，使用索引
      from: {
        email: msg.from
      },
      to: [{
        email: emailAddress
      }],
      subject: msg.subject,
      textContent: stripHtml(msg.body),
      htmlContent: msg.body,
      receivedAt: parseDate(msg.date),
      isRead: false, // EtempMail 没有已读状态
      provider: this.name,
      size: msg.body.length
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