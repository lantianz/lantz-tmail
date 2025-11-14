import type { IMailProvider } from '../interfaces/mail-provider.js';
import type {
  ChannelConfiguration,
  ChannelResponse,
  ChannelCapabilities,
  ChannelHealth,
  ChannelStats
} from '../types/channel.js';
import type {
  CreateEmailRequest,
  CreateEmailResponse,
  EmailListQuery,
  EmailMessage,
  EmailContact,
  ImapConfig,
  ImapSession
} from '../types/email.js';
import { CryptoUtil } from '../utils/crypto.js';
import { generateEmailPrefix } from '../utils/helpers.js';

/**
 * IMAP 邮件提供商
 * 支持连接用户自有的 IMAP 邮箱（Gmail、QQ 邮箱、163 等）
 */
export class ImapProvider implements IMailProvider {
  readonly name = 'imap';

  readonly capabilities: ChannelCapabilities = {
    createEmail: true,        // 实际是"连接"邮箱
    listEmails: true,
    getEmailContent: true,
    customDomains: true,      // 用户自定义域名
    customPrefix: false,
    emailExpiration: false,
    realTimeUpdates: false,
    attachmentSupport: true   // ✅ 支持附件元数据(文件名、大小、类型等)
  };

  private config: ChannelConfiguration;
  private timeout: number;
  private stats: ChannelStats;
  private connectionPool = new Map<string, { client: any; lastUsed: number }>();
  private readonly POOL_CLEANUP_INTERVAL = 5 * 60 * 1000; // 5 分钟
  private readonly CONNECTION_MAX_IDLE = 10 * 60 * 1000; // 10 分钟

  constructor(config: ChannelConfiguration) {
    this.config = config;
    this.timeout = config.timeout || parseInt(process.env.IMAP_TIMEOUT || '120000', 10);
    this.stats = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      averageResponseTime: 0,
      lastRequestTime: new Date(),
      uptime: Date.now()
    };

    // 启动连接池清理定时器
    this.startPoolCleanup();
  }

  async initialize(config: ChannelConfiguration): Promise<void> {
    // 检测运行环境
    if (this.isCloudflareWorkers()) {
      console.warn('⚠️  IMAP Provider 不支持 Cloudflare Workers 环境（需要 TCP Socket）');
      throw new Error('IMAP Provider 仅支持 Node.js 环境');
    }

    this.config = config;
    console.log('✅ IMAP Provider initialized');
  }

  /**
   * 创建邮箱（实际是生成临时邮箱地址，并连接到用户的 IMAP 邮箱）
   */
  async createEmail(request: CreateEmailRequest): Promise<ChannelResponse<CreateEmailResponse>> {
    const startTime = Date.now();
    this.stats.totalRequests++;

    try {
      // 1. 验证 imap 配置
      if (!request.imap) {
        throw new Error('当 provider 为 "imap" 时，imap 字段为必填');
      }

      this.validateImapConfig(request.imap);

      // 2. 测试 IMAP 连接
      await this.testImapConnection(request.imap);

      // 3. 生成随机的临时邮箱地址
      const username = request.prefix || generateEmailPrefix(10);
      const tempEmailAddress = `${username}@${request.imap.domain}`;

      // 4. 生成 accessToken（包含 IMAP 配置和临时邮箱地址）
      const accessToken = await this.generateAccessToken(request.imap, tempEmailAddress);

      // 5. 返回结果（返回临时邮箱地址，而不是真实邮箱）
      this.stats.successfulRequests++;
      this.updateResponseTime(Date.now() - startTime);

      return {
        success: true,
        data: {
          address: tempEmailAddress,           // ✅ 返回临时邮箱地址
          domain: request.imap.domain,         // ✅ 用户自定义域名
          username: username,                  // ✅ 随机生成的用户名
          provider: this.name,
          accessToken,                         // ✅ 包含真实 IMAP 配置的加密 token
          expiresAt: undefined
        },
        metadata: {
          provider: this.name,
          timestamp: new Date().toISOString(),
          responseTime: Date.now() - startTime
        }
      };
    } catch (error) {
      this.stats.failedRequests++;
      return this.handleError(error, 'createEmail');
    }
  }

  /**
   * 获取邮件列表（筛选发送到临时邮箱地址的邮件）
   */
  async getEmails(query: EmailListQuery): Promise<ChannelResponse<EmailMessage[]>> {
    const startTime = Date.now();
    this.stats.totalRequests++;

    try {
      // 1. 解析 accessToken
      if (!query.accessToken) {
        throw new Error('accessToken 为必填字段');
      }

      const session = await this.parseAccessToken(query.accessToken);
      const { tempEmailAddress, imapConfig } = session;

      // 2. 连接 IMAP（使用连接池）
      const client = await this.getConnection(imapConfig);

      try {
        // 3. 选择邮箱目录
        const mailbox = imapConfig.imap_dir || 'INBOX';
        await client.mailboxOpen(mailbox);

        // 4. 获取最近 24 小时的最新 5 条邮件，并筛选发送到临时邮箱的邮件
        const messages = await this.fetchRecentMessages(client, 5, tempEmailAddress);

        this.stats.successfulRequests++;
        this.updateResponseTime(Date.now() - startTime);

        return {
          success: true,
          data: messages,
          metadata: {
            provider: this.name,
            timestamp: new Date().toISOString(),
            responseTime: Date.now() - startTime,
            total: messages.length
          }
        };
      } finally {
        // 不关闭连接，放回连接池
        this.releaseConnection(imapConfig, client);
      }
    } catch (error) {
      this.stats.failedRequests++;
      return this.handleError(error, 'getEmails');
    }
  }

  /**
   * 获取邮件详情
   */
  async getEmailContent(emailAddress: string, emailId: string, accessToken?: string): Promise<ChannelResponse<EmailMessage>> {
    const startTime = Date.now();
    this.stats.totalRequests++;

    try {
      if (!accessToken) {
        throw new Error('accessToken 为必填字段');
      }

      const session = await this.parseAccessToken(accessToken);
      const { imapConfig } = session;
      const client = await this.getConnection(imapConfig);

      try {
        const mailbox = imapConfig.imap_dir || 'INBOX';
        await client.mailboxOpen(mailbox);

        // 获取完整邮件内容
        const message = await this.fetchMessageContent(client, emailId);

        this.stats.successfulRequests++;
        this.updateResponseTime(Date.now() - startTime);

        return {
          success: true,
          data: message,
          metadata: {
            provider: this.name,
            timestamp: new Date().toISOString(),
            responseTime: Date.now() - startTime
          }
        };
      } finally {
        this.releaseConnection(imapConfig, client);
      }
    } catch (error) {
      this.stats.failedRequests++;
      return this.handleError(error, 'getEmailContent');
    }
  }

  async getHealth(): Promise<ChannelHealth> {
    const successRate = this.stats.totalRequests > 0
      ? (this.stats.successfulRequests / this.stats.totalRequests) * 100
      : 100;

    return {
      status: successRate >= 80 ? 'healthy' : successRate >= 50 ? 'degraded' : 'unhealthy',
      lastChecked: new Date(),
      errorCount: this.stats.failedRequests,
      successRate,
      uptime: Date.now() - this.stats.uptime,
      responseTime: this.stats.averageResponseTime
    };
  }

  getStats(): ChannelStats {
    return { ...this.stats };
  }

  async testConnection(): Promise<boolean> {
    return true;
  }

  // ===== 私有方法 =====

  /**
   * 验证 IMAP 配置
   */
  private validateImapConfig(config: ImapConfig): void {
    const required = ['domain', 'imap_server', 'imap_user', 'imap_pass'];
    for (const field of required) {
      if (!config[field as keyof ImapConfig]) {
        throw new Error(`imap.${field} 为必填字段`);
      }
    }

    // 验证邮箱格式
    if (!this.isValidEmail(config.imap_user)) {
      throw new Error('imap.imap_user 必须是有效的邮箱地址');
    }

    // 验证端口
    if (config.imap_port && (config.imap_port < 1 || config.imap_port > 65535)) {
      throw new Error('imap.imap_port 必须在 1-65535 之间');
    }
  }

  /**
   * 测试 IMAP 连接
   */
  private async testImapConnection(config: ImapConfig): Promise<void> {
    const client = await this.connectImap(config);
    await client.logout();
  }

  /**
   * 连接 IMAP 服务器
   */
  private async connectImap(config: ImapConfig): Promise<any> {
    const { ImapFlow } = await import('imapflow');

    const client = new ImapFlow({
      host: config.imap_server,
      port: config.imap_port || 993,
      secure: true,
      auth: {
        user: config.imap_user,
        pass: config.imap_pass
      },
      logger: false,
      tls: {
        rejectUnauthorized: true
      },
      // 设置连接和操作超时
      connectionTimeout: this.timeout,
      greetingTimeout: this.timeout
    });

    await client.connect();
    return client;
  }


  /**
   * 获取连接（使用连接池）
   */
  private async getConnection(config: ImapConfig): Promise<any> {
    const key = this.getConnectionKey(config);
    const pooled = this.connectionPool.get(key);

    if (pooled && pooled.client.usable) {
      pooled.lastUsed = Date.now();
      return pooled.client;
    }

    // 创建新连接
    const client = await this.connectImap(config);
    this.connectionPool.set(key, {
      client,
      lastUsed: Date.now()
    });

    return client;
  }

  /**
   * 释放连接（放回连接池）
   */
  private releaseConnection(config: ImapConfig, client: any): void {
    const key = this.getConnectionKey(config);
    const pooled = this.connectionPool.get(key);

    if (pooled && pooled.client === client) {
      pooled.lastUsed = Date.now();
    }
  }

  /**
   * 获取连接池键
   */
  private getConnectionKey(config: ImapConfig): string {
    return `${config.imap_server}:${config.imap_port || 993}:${config.imap_user}`;
  }

  /**
   * 启动连接池清理定时器
   */
  private startPoolCleanup(): void {
    setInterval(() => {
      const now = Date.now();
      for (const [key, pooled] of this.connectionPool.entries()) {
        if (now - pooled.lastUsed > this.CONNECTION_MAX_IDLE) {
          try {
            pooled.client.logout();
          } catch (error) {
            // 忽略错误
          }
          this.connectionPool.delete(key);
        }
      }
    }, this.POOL_CLEANUP_INTERVAL);
  }

  /**
   * 获取最近的邮件（最近 24 小时，最多 limit 条，筛选发送到临时邮箱的邮件）
   */
  private async fetchRecentMessages(client: any, limit: number = 5, tempEmailAddress?: string): Promise<EmailMessage[]> {
    // 计算 24 小时前的时间
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // 搜索最近 24 小时的邮件
    const messages: EmailMessage[] = [];

    try {
      // 使用 SINCE 搜索条件
      const searchResults = await client.search({ since });

      if (!searchResults || searchResults.length === 0) {
        return [];
      }

      // 获取最新的 N 条（获取更多以便筛选）
      const fetchLimit = tempEmailAddress ? Math.min(searchResults.length, limit * 10) : limit;
      const uids = searchResults.slice(-fetchLimit);

      // 获取邮件头信息
      for await (const msg of client.fetch(uids, {
        envelope: true,
        uid: true,
        bodyStructure: true,
        internalDate: true
      })) {
        const envelope = msg.envelope;

        // 如果指定了临时邮箱地址，则筛选收件人
        if (tempEmailAddress) {
          const toAddresses = envelope.to?.map((addr: any) => addr.address?.toLowerCase()) || [];
          const ccAddresses = envelope.cc?.map((addr: any) => addr.address?.toLowerCase()) || [];
          const bccAddresses = envelope.bcc?.map((addr: any) => addr.address?.toLowerCase()) || [];

          const allRecipients = [...toAddresses, ...ccAddresses, ...bccAddresses];
          const tempEmailLower = tempEmailAddress.toLowerCase();

          // 只保留发送到临时邮箱地址的邮件
          if (!allRecipients.includes(tempEmailLower)) {
            continue;
          }
        }

        messages.push({
          id: msg.uid.toString(),
          from: this.parseEmailContact(envelope.from?.[0]),
          to: envelope.to?.map((addr: any) => this.parseEmailContact(addr)) || [],
          cc: envelope.cc?.map((addr: any) => this.parseEmailContact(addr)),
          subject: envelope.subject || '(无主题)',
          textContent: undefined,
          htmlContent: undefined,
          receivedAt: msg.internalDate || new Date(),
          isRead: msg.flags?.has('\\Seen') || false,
          size: msg.size,
          provider: this.name,
          messageId: envelope.messageId
        });

        // 如果已经收集到足够的邮件，停止
        if (messages.length >= limit) {
          break;
        }
      }

      // 按时间倒序排列（最新的在前）
      messages.sort((a, b) => b.receivedAt.getTime() - a.receivedAt.getTime());

      // 确保不超过限制
      return messages.slice(0, limit);
    } catch (error) {
      console.error('获取邮件列表失败:', error);
      throw error;
    }
  }

  /**
   * 获取邮件完整内容
   */
  private async fetchMessageContent(client: any, emailId: string): Promise<EmailMessage> {
    const uid = parseInt(emailId, 10);

    // 获取完整邮件 (使用 UID 模式)
    const message = await client.fetchOne(uid, {
      envelope: true,
      uid: true,
      bodyStructure: true,
      internalDate: true,
      source: true
    }, { uid: true }); // ✅ 指定第一个参数是 UID 而不是序列号

    if (!message) {
      throw new Error(`邮件不存在: ${emailId}`);
    }

    const envelope = message.envelope;

    // 解析邮件内容
    let textContent: string | undefined;
    let htmlContent: string | undefined;

    // 查找 text/plain 和 text/html 部分
    const textPart = this.findBodyPart(message.bodyStructure, 'text/plain');
    const htmlPart = this.findBodyPart(message.bodyStructure, 'text/html');

    try {
      // 获取文本部分
      if (textPart) {
        const download = await client.download(uid, textPart, { uid: true });
        if (download && download.content) {
          // download.content 是一个 ReadableStream,需要读取流内容
          const chunks: Buffer[] = [];
          for await (const chunk of download.content) {
            chunks.push(chunk);
          }
          const buffer = Buffer.concat(chunks);
          textContent = buffer.toString('utf-8');
        }
      }
    } catch (error) {
      console.error(`[IMAP] 邮件 ${emailId} - 获取文本内容失败:`, error);
    }

    try {
      // 获取 HTML 部分
      if (htmlPart) {
        const download = await client.download(uid, htmlPart, { uid: true });
        if (download && download.content) {
          // download.content 是一个 ReadableStream,需要读取流内容
          const chunks: Buffer[] = [];
          for await (const chunk of download.content) {
            chunks.push(chunk);
          }
          const buffer = Buffer.concat(chunks);
          htmlContent = buffer.toString('utf-8');
        }
      }
    } catch (error) {
      console.error(`[IMAP] 邮件 ${emailId} - 获取 HTML 内容失败:`, error);
    }

    // 如果都没有获取到，尝试解析原始邮件源码
    if (!textContent && !htmlContent && message.source) {
      try {
        const parsed = this.parseEmailSource(message.source.toString());
        textContent = parsed.text;
        htmlContent = parsed.html;
      } catch (error) {
        console.error(`[IMAP] 邮件 ${emailId} - 解析邮件源码失败:`, error);
      }
    }

    // 查找附件
    const attachments = this.findAttachments(message.bodyStructure);

    return {
      id: uid.toString(),
      from: this.parseEmailContact(envelope.from?.[0]),
      to: envelope.to?.map((addr: any) => this.parseEmailContact(addr)) || [],
      cc: envelope.cc?.map((addr: any) => this.parseEmailContact(addr)),
      subject: envelope.subject || '(无主题)',
      textContent,
      htmlContent,
      attachments: attachments.length > 0 ? attachments : undefined,
      receivedAt: message.internalDate || new Date(),
      isRead: message.flags?.has('\\Seen') || false,
      size: message.size,
      provider: this.name,
      messageId: envelope.messageId
    };
  }

  /**
   * 在 bodyStructure 中查找指定类型的部分
   */
  private findBodyPart(structure: any, mimeType: string): string | null {
    if (!structure) return null;

    // 获取完整的 MIME type
    // ImapFlow 可能返回:
    // 1. structure.type = "text/plain" (完整格式)
    // 2. structure.type = "text", structure.subtype = "plain" (分开格式)
    let fullType: string;
    const typeStr = structure.type?.toLowerCase() || '';

    if (typeStr.includes('/')) {
      // 已经是完整的 MIME type
      fullType = typeStr;
    } else {
      // 需要拼接 type 和 subtype
      const subtypeStr = structure.subtype?.toLowerCase() || '';
      fullType = subtypeStr ? `${typeStr}/${subtypeStr}` : typeStr;
    }

    // 检查是否匹配目标 MIME type
    if (fullType === mimeType.toLowerCase()) {
      // 优先使用 structure.part,否则使用 '1'
      return structure.part || '1';
    }

    // 如果是 multipart，递归查找子部分
    if (fullType.startsWith('multipart/') && Array.isArray(structure.childNodes)) {
      for (const childNode of structure.childNodes) {
        const result = this.findBodyPart(childNode, mimeType);
        if (result) return result;
      }
    }

    return null;
  }

  /**
   * 在 bodyStructure 中查找附件
   */
  private findAttachments(structure: any, attachments: any[] = []): any[] {
    if (!structure) return attachments;

    // 获取完整的 MIME type (同 findBodyPart 的逻辑)
    let fullType: string;
    const typeStr = structure.type?.toLowerCase() || '';

    if (typeStr.includes('/')) {
      fullType = typeStr;
    } else {
      const subtypeStr = structure.subtype?.toLowerCase() || '';
      fullType = subtypeStr ? `${typeStr}/${subtypeStr}` : typeStr;
    }

    const disposition = structure.disposition?.toLowerCase();
    const dispositionParams = structure.dispositionParameters || {};

    // 判断是否为附件:
    // 1. disposition 为 'attachment' 或 'inline'
    // 2. 或者有 filename 参数
    // 3. 排除 text/plain 和 text/html (这些是邮件正文)
    const isAttachment =
      (disposition === 'attachment' || disposition === 'inline') ||
      (dispositionParams.filename) ||
      (structure.parameters?.name);

    const isTextContent = fullType === 'text/plain' || fullType === 'text/html';

    if (isAttachment && !isTextContent) {
      const filename =
        dispositionParams.filename ||
        structure.parameters?.name ||
        `attachment-${attachments.length + 1}`;

      attachments.push({
        id: structure.part || `${attachments.length + 1}`,
        filename: filename,
        contentType: fullType,
        size: structure.size || 0,
        inline: disposition === 'inline',
        contentId: structure.id
      });
    }

    // 如果是 multipart，递归查找子部分
    if (fullType.startsWith('multipart/') && Array.isArray(structure.childNodes)) {
      for (const childNode of structure.childNodes) {
        this.findAttachments(childNode, attachments);
      }
    }

    return attachments;
  }

  /**
   * 简单解析邮件源码（提取文本和 HTML 内容）
   */
  private parseEmailSource(source: Buffer): { text?: string; html?: string } {
    const content = source.toString('utf-8');
    const result: { text?: string; html?: string } = {};

    // 简单的 MIME 解析（查找 text/plain 和 text/html 部分）
    const textMatch = content.match(/Content-Type: text\/plain[\s\S]*?\n\n([\s\S]*?)(?=\n--|\n\r\n--|\r\n--|\Z)/i);
    const htmlMatch = content.match(/Content-Type: text\/html[\s\S]*?\n\n([\s\S]*?)(?=\n--|\n\r\n--|\r\n--|\Z)/i);

    if (textMatch && textMatch[1]) {
      result.text = textMatch[1].trim();
    }

    if (htmlMatch && htmlMatch[1]) {
      result.html = htmlMatch[1].trim();
    }

    // 如果没有找到 MIME 部分，可能是纯文本邮件
    if (!result.text && !result.html) {
      const bodyMatch = content.match(/\n\n([\s\S]+)$/);
      if (bodyMatch && bodyMatch[1]) {
        result.text = bodyMatch[1].trim();
      }
    }

    return result;
  }


  /**
   * 生成 accessToken（包含临时邮箱地址和真实 IMAP 配置）
   */
  private async generateAccessToken(config: ImapConfig, tempEmailAddress: string): Promise<string> {
    const encryptEnabled = process.env.IMAP_ENCRYPT_TOKEN === 'true';

    const session: ImapSession = {
      tempEmailAddress,
      imapConfig: config
    };

    if (encryptEnabled) {
      // 加密模式
      const encryptionKey = process.env.IMAP_ENCRYPTION_KEY;
      if (!encryptionKey) {
        throw new Error('IMAP_ENCRYPTION_KEY 环境变量未设置（启用加密时必须设置）');
      }
      return await CryptoUtil.encryptImapSession(session, encryptionKey);
    } else {
      // 不加密模式（仅 Base64 编码）
      return CryptoUtil.encodeImapSession(session);
    }
  }

  /**
   * 解析 accessToken（获取临时邮箱地址和真实 IMAP 配置）
   */
  private async parseAccessToken(token: string): Promise<ImapSession> {
    const encryptEnabled = process.env.IMAP_ENCRYPT_TOKEN === 'true';

    try {
      if (encryptEnabled) {
        // 解密模式
        const encryptionKey = process.env.IMAP_ENCRYPTION_KEY;
        if (!encryptionKey) {
          throw new Error('IMAP_ENCRYPTION_KEY 环境变量未设置');
        }
        return await CryptoUtil.decryptImapSession(token, encryptionKey);
      } else {
        // 不加密模式（Base64 解码）
        return CryptoUtil.decodeImapSession(token);
      }
    } catch (error) {
      throw new Error('无效的 accessToken');
    }
  }

  /**
   * 解析邮件联系人
   */
  private parseEmailContact(addr: any): EmailContact {
    if (!addr) {
      return { email: 'unknown@unknown.com' };
    }

    return {
      email: addr.address || 'unknown@unknown.com',
      name: addr.name
    };
  }

  /**
   * 检测是否在 Cloudflare Workers 环境
   */
  private isCloudflareWorkers(): boolean {
    return typeof (globalThis as any).caches !== 'undefined' &&
           typeof (globalThis as any).WebSocketPair !== 'undefined';
  }

  /**
   * 验证邮箱格式
   */
  private isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  /**
   * 更新平均响应时间
   */
  private updateResponseTime(responseTime: number): void {
    const total = this.stats.totalRequests;
    this.stats.averageResponseTime =
      (this.stats.averageResponseTime * (total - 1) + responseTime) / total;
    this.stats.lastRequestTime = new Date();
  }

  /**
   * 错误处理
   */
  private handleError(error: unknown, operation: string): ChannelResponse<any> {
    const errorMessage = error instanceof Error ? error.message : String(error);

    // 详细错误信息（不包含建议）
    let detailedError = errorMessage;
    let errorDetails: any = undefined;

    // 根据错误类型提供详细信息
    if (errorMessage.includes('ECONNREFUSED') || errorMessage.includes('ETIMEDOUT')) {
      detailedError = 'IMAP 连接失败：无法连接到服务器';
      errorDetails = {
        reason: '网络连接失败或服务器地址错误',
        operation
      };
    } else if (errorMessage.includes('AUTHENTICATIONFAILED') || errorMessage.includes('Invalid credentials')) {
      detailedError = 'IMAP 认证失败：用户名或密码错误';
      errorDetails = {
        reason: '认证信息无效',
        operation
      };
    } else if (errorMessage.includes('Mailbox does not exist')) {
      detailedError = 'IMAP 操作失败：邮箱目录不存在';
      errorDetails = {
        reason: '指定的邮箱目录不存在',
        operation
      };
    }

    console.error(`IMAP Provider ${operation} 失败:`, errorMessage);

    return {
      success: false,
      error: detailedError,
      metadata: {
        provider: this.name,
        timestamp: new Date().toISOString(),
        operation,
        details: errorDetails
      }
    };
  }
}


