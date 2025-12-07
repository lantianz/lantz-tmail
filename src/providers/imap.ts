import type { IMailProvider } from '../interfaces/mail-provider.js'
import type {
  ChannelConfiguration,
  ChannelResponse,
  ChannelCapabilities,
  ChannelHealth,
  ChannelStats,
  ChannelError,
} from '../types/channel.js'
import { ChannelStatus, ChannelErrorType } from '../types/channel.js'
import type {
  CreateEmailRequest,
  CreateEmailResponse,
  EmailListQuery,
  EmailMessage,
  EmailContact,
  ImapConfig,
  ImapSession,
} from '../types/email.js'
import { CryptoUtil } from '../utils/crypto.js'
import { generateEmailPrefix } from '../utils/helpers.js'

/**
 * IMAP 邮件提供商
 * 支持连接用户自有的 IMAP 邮箱（Gmail、QQ 邮箱、163 等）
 */
export class ImapProvider implements IMailProvider {
  readonly name = 'imap'

  readonly capabilities: ChannelCapabilities = {
    createEmail: true, // 实际是"连接"邮箱
    listEmails: true,
    getEmailContent: true,
    customDomains: true, // 用户自定义域名
    customPrefix: false,
    emailExpiration: false,
    realTimeUpdates: false,
    attachmentSupport: true, // ✅ 支持附件元数据(文件名、大小、类型等)
  }

  readonly config: ChannelConfiguration
  private timeout: number
  private stats: ChannelStats
  private connectionPool = new Map<string, { client: any; lastUsed: number }>()
  private readonly POOL_CLEANUP_INTERVAL = 5 * 60 * 1000 // 5 分钟
  private readonly CONNECTION_MAX_IDLE = 10 * 60 * 1000 // 10 分钟

  constructor(config: ChannelConfiguration) {
    this.config = config
    this.timeout =
      config.timeout || parseInt(process.env.IMAP_TIMEOUT || '120000', 10)
    this.stats = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      averageResponseTime: 0,
      lastRequestTime: new Date(),
      errorsToday: 0,
      requestsToday: 0,
      uptime: Date.now(),
    }

    // 启动连接池清理定时器
    this.startPoolCleanup()
  }

  async initialize(config: ChannelConfiguration): Promise<void> {
    // 检测运行环境
    if (this.isCloudflareWorkers()) {
      console.warn(
        '⚠️  IMAP Provider 不支持 Cloudflare Workers 环境（需要 TCP Socket）'
      )
      throw new Error('IMAP Provider 仅支持 Node.js 环境')
    }

    // config 已在构造函数中设置，这里可以更新其他配置
    this.timeout =
      config.timeout || parseInt(process.env.IMAP_TIMEOUT || '120000', 10)
    console.log('✅ IMAP Provider initialized')
  }

  /**
   * 创建邮箱（实际是生成临时邮箱地址，并连接到用户的 IMAP 邮箱）
   */
  async createEmail(
    request: CreateEmailRequest
  ): Promise<ChannelResponse<CreateEmailResponse>> {
    const startTime = Date.now()
    this.stats.totalRequests++

    try {
      // 1. 验证 imap 配置
      if (!request.imap) {
        throw new Error('当 provider 为 "imap" 时，imap 字段为必填')
      }

      this.validateImapConfig(request.imap, request.isMine)

      // 2. 测试 IMAP 连接
      await this.testImapConnection(request.imap)

      // 3. 生成邮箱地址
      let tempEmailAddress: string
      let username: string
      let domain: string

      if (request.isMine) {
        // isMine=true: 使用真实邮箱地址，获取所有邮件
        tempEmailAddress = request.imap.imap_user
        const emailParts = request.imap.imap_user.split('@')
        username = emailParts[0]
        domain = emailParts[1] || request.imap.domain
      } else {
        // isMine=false: 生成临时邮箱地址
        username = request.prefix || generateEmailPrefix(10)
        domain = request.imap.domain
        tempEmailAddress = `${username}@${domain}`
      }

      // 4. 生成 accessToken（包含 IMAP 配置和临时邮箱地址）
      const accessToken = await this.generateAccessToken(
        request.imap,
        tempEmailAddress
      )

      // 5. 返回结果
      this.stats.successfulRequests++
      this.updateResponseTime(Date.now() - startTime)

      return {
        success: true,
        data: {
          address: tempEmailAddress,
          domain: domain,
          username: username,
          provider: this.name,
          accessToken,
          expiresAt: undefined,
        },
        metadata: {
          provider: this.name,
          responseTime: Date.now() - startTime,
          timestamp: new Date().toISOString(),
        },
      }
    } catch (error) {
      this.stats.failedRequests++
      return this.handleError(error, 'createEmail')
    }
  }

  /**
   * 获取邮件列表（筛选发送到临时邮箱地址的邮件）
   */
  async getEmails(
    query: EmailListQuery
  ): Promise<ChannelResponse<EmailMessage[]>> {
    const startTime = Date.now()
    this.stats.totalRequests++

    try {
      // 1. 解析 accessToken
      if (!query.accessToken) {
        throw new Error('accessToken 为必填字段')
      }

      const session = await this.parseAccessToken(query.accessToken)
      const { tempEmailAddress, imapConfig } = session

      // 2. 连接 IMAP（使用连接池）
      const client = await this.getConnection(imapConfig)

      try {
        // 3. 选择邮箱目录
        const mailbox = imapConfig.imap_dir || 'INBOX'
        await client.mailboxOpen(mailbox)

        // 4. 获取最近 24 小时内发送到临时邮箱的所有邮件
        const messages = await this.fetchRecentMessages(
          client,
          tempEmailAddress
        )

        this.stats.successfulRequests++
        this.updateResponseTime(Date.now() - startTime)

        return {
          success: true,
          data: messages,
          metadata: {
            provider: this.name,
            responseTime: Date.now() - startTime,
            timestamp: new Date().toISOString(),
            total: messages.length,
          },
        }
      } catch (connectionError: any) {
        // 如果是连接错误，从连接池中移除
        if (
          connectionError.code === 'ECONNRESET' ||
          connectionError.code === 'ETIMEDOUT' ||
          connectionError.code === 'ENOTFOUND' ||
          connectionError.message?.includes('Connection')
        ) {
          console.error(
            `[IMAP] 连接错误，从连接池移除 (${imapConfig.imap_user}):`,
            connectionError.message
          )
          this.removeConnection(imapConfig)
        }
        throw connectionError
      } finally {
        // 不关闭连接，放回连接池
        this.releaseConnection(imapConfig, client)
      }
    } catch (error) {
      this.stats.failedRequests++
      return this.handleError(error, 'getEmails')
    }
  }

  /**
   * 获取邮件详情
   */
  async getEmailContent(
    emailAddress: string,
    emailId: string,
    accessToken?: string
  ): Promise<ChannelResponse<EmailMessage>> {
    const startTime = Date.now()
    this.stats.totalRequests++

    try {
      if (!accessToken) {
        throw new Error('accessToken 为必填字段')
      }

      const session = await this.parseAccessToken(accessToken)
      const { imapConfig } = session
      const client = await this.getConnection(imapConfig)

      try {
        const mailbox = imapConfig.imap_dir || 'INBOX'
        await client.mailboxOpen(mailbox)

        // 获取完整邮件内容
        const message = await this.fetchMessageContent(client, emailId)

        this.stats.successfulRequests++
        this.updateResponseTime(Date.now() - startTime)

        return {
          success: true,
          data: message,
          metadata: {
            provider: this.name,
            responseTime: Date.now() - startTime,
            timestamp: new Date().toISOString(),
          },
        }
      } catch (connectionError: any) {
        // 如果是连接错误，从连接池中移除
        if (
          connectionError.code === 'ECONNRESET' ||
          connectionError.code === 'ETIMEDOUT' ||
          connectionError.code === 'ENOTFOUND' ||
          connectionError.message?.includes('Connection')
        ) {
          console.error(
            `[IMAP] 连接错误，从连接池移除 (${imapConfig.imap_user}):`,
            connectionError.message
          )
          this.removeConnection(imapConfig)
        }
        throw connectionError
      } finally {
        this.releaseConnection(imapConfig, client)
      }
    } catch (error) {
      this.stats.failedRequests++
      return this.handleError(error, 'getEmailContent')
    }
  }

  async getHealth(): Promise<ChannelHealth> {
    const successRate =
      this.stats.totalRequests > 0
        ? (this.stats.successfulRequests / this.stats.totalRequests) * 100
        : 100

    // 根据成功率确定状态
    let status: ChannelStatus
    if (successRate >= 80) {
      status = ChannelStatus.ACTIVE
    } else if (successRate >= 50) {
      status = ChannelStatus.ERROR
    } else {
      status = ChannelStatus.ERROR
    }

    return {
      status,
      lastChecked: new Date(),
      errorCount: this.stats.failedRequests,
      successRate,
      uptime: Date.now() - this.stats.uptime,
      responseTime: this.stats.averageResponseTime,
    }
  }

  getStats(): ChannelStats {
    return { ...this.stats }
  }

  async testConnection(): Promise<ChannelResponse<boolean>> {
    const startTime = Date.now()
    return {
      success: true,
      data: true,
      metadata: {
        provider: this.name,
        responseTime: Date.now() - startTime,
      },
    }
  }

  // ===== 私有方法 =====

  /**
   * 验证 IMAP 配置
   */
  private validateImapConfig(config: ImapConfig, isMine?: boolean): void {
    // 当 isMine=true 时，domain 不是必填的（会从 imap_user 中提取）
    const required = isMine
      ? ['imap_server', 'imap_user', 'imap_pass']
      : ['domain', 'imap_server', 'imap_user', 'imap_pass']

    for (const field of required) {
      if (!config[field as keyof ImapConfig]) {
        throw new Error(`imap.${field} 为必填字段`)
      }
    }

    // 验证邮箱格式
    if (!this.isValidEmail(config.imap_user)) {
      throw new Error('imap.imap_user 必须是有效的邮箱地址')
    }

    // 验证端口
    if (
      config.imap_port &&
      (config.imap_port < 1 || config.imap_port > 65535)
    ) {
      throw new Error('imap.imap_port 必须在 1-65535 之间')
    }
  }

  /**
   * 测试 IMAP 连接
   */
  private async testImapConnection(config: ImapConfig): Promise<void> {
    const client = await this.connectImap(config)
    await client.logout()
  }

  /**
   * 连接 IMAP 服务器
   */
  private async connectImap(config: ImapConfig): Promise<any> {
    try {
      const { ImapFlow } = await import('imapflow')

      const client = new ImapFlow({
        host: config.imap_server,
        port: config.imap_port || 993,
        secure: true,
        auth: {
          user: config.imap_user,
          pass: config.imap_pass,
        },
        logger: false,
        tls: {
          rejectUnauthorized: true,
        },
        // 设置连接和操作超时
        connectionTimeout: this.timeout,
        greetingTimeout: this.timeout,
      })

      // 添加错误监听器，防止未捕获的错误导致进程崩溃
      client.on('error', (error: any) => {
        console.error(
          `[IMAP] 连接错误 (${config.imap_user}@${config.imap_server}):`,
          error.message || error
        )
        // 从连接池中移除出错的连接
        this.removeConnection(config)
      })

      // 添加关闭事件监听器
      client.on('close', () => {
        console.log(
          `[IMAP] 连接已关闭 (${config.imap_user}@${config.imap_server})`
        )
        this.removeConnection(config)
      })

      await client.connect()
      console.log(`[IMAP] 连接成功 (${config.imap_user}@${config.imap_server})`)
      return client
    } catch (error: any) {
      console.error(
        `[IMAP] 连接失败 (${config.imap_user}@${config.imap_server}):`,
        error.message || error
      )
      if (
        error.code === 'MODULE_NOT_FOUND' ||
        error.message?.includes('Cannot find module')
      ) {
        throw new Error(
          'IMAP 功能不可用：imapflow 模块未安装。IMAP Provider 仅在 Node.js 环境中可用。'
        )
      }
      throw error
    }
  }

  /**
   * 获取连接（使用连接池）
   */
  private async getConnection(config: ImapConfig): Promise<any> {
    const key = this.getConnectionKey(config)
    const pooled = this.connectionPool.get(key)

    // 检查连接是否可用
    if (pooled) {
      try {
        if (pooled.client.usable) {
          pooled.lastUsed = Date.now()
          console.log(`[IMAP] 复用连接池中的连接 (${config.imap_user})`)
          return pooled.client
        } else {
          console.log(
            `[IMAP] 连接池中的连接不可用，移除并重新创建 (${config.imap_user})`
          )
          this.connectionPool.delete(key)
        }
      } catch (error) {
        console.error(
          `[IMAP] 检查连接可用性失败，移除并重新创建 (${config.imap_user}):`,
          error
        )
        this.connectionPool.delete(key)
      }
    }

    // 创建新连接
    console.log(`[IMAP] 创建新连接 (${config.imap_user})`)
    const client = await this.connectImap(config)
    this.connectionPool.set(key, {
      client,
      lastUsed: Date.now(),
    })

    return client
  }

  /**
   * 从连接池中移除连接
   */
  private removeConnection(config: ImapConfig): void {
    const key = this.getConnectionKey(config)
    const pooled = this.connectionPool.get(key)

    if (pooled) {
      try {
        if (pooled.client && typeof pooled.client.logout === 'function') {
          pooled.client.logout().catch(() => {
            // 忽略 logout 错误
          })
        }
      } catch (error) {
        // 忽略错误
      }
      this.connectionPool.delete(key)
      console.log(`[IMAP] 已从连接池移除连接 (${config.imap_user})`)
    }
  }

  /**
   * 释放连接（放回连接池）
   */
  private releaseConnection(config: ImapConfig, client: any): void {
    const key = this.getConnectionKey(config)
    const pooled = this.connectionPool.get(key)

    if (pooled && pooled.client === client) {
      pooled.lastUsed = Date.now()
    }
  }

  /**
   * 获取连接池键
   */
  private getConnectionKey(config: ImapConfig): string {
    return `${config.imap_server}:${config.imap_port || 993}:${config.imap_user}`
  }

  /**
   * 启动连接池清理定时器
   */
  private startPoolCleanup(): void {
    setInterval(() => {
      const now = Date.now()
      let cleanedCount = 0

      for (const [key, pooled] of this.connectionPool.entries()) {
        const idleTime = now - pooled.lastUsed

        // 清理超过最大空闲时间的连接
        if (idleTime > this.CONNECTION_MAX_IDLE) {
          try {
            if (pooled.client && typeof pooled.client.logout === 'function') {
              pooled.client.logout().catch(() => {
                // 忽略 logout 错误
              })
            }
          } catch (error) {
            console.error(`[IMAP] 清理连接时出错 (${key}):`, error)
          }
          this.connectionPool.delete(key)
          cleanedCount++
        }
        // 检查连接是否仍然可用
        else if (pooled.client && !pooled.client.usable) {
          console.log(`[IMAP] 发现不可用的连接，清理 (${key})`)
          this.connectionPool.delete(key)
          cleanedCount++
        }
      }

      if (cleanedCount > 0) {
        console.log(
          `[IMAP] 连接池清理完成，清理了 ${cleanedCount} 个连接，剩余 ${this.connectionPool.size} 个连接`
        )
      }
    }, this.POOL_CLEANUP_INTERVAL)
  }

  /**
   * 获取最近 24 小时内发送到临时邮箱的所有邮件
   * @param client IMAP 客户端
   * @param tempEmailAddress 临时邮箱地址（必填）
   * @returns 符合条件的所有邮件列表
   */
  private async fetchRecentMessages(
    client: any,
    tempEmailAddress: string
  ): Promise<EmailMessage[]> {
    // 计算 24 小时前的时间
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000)

    const messages: EmailMessage[] = []

    try {
      // 使用 SINCE 搜索条件获取最近 24 小时的邮件
      const searchResults = await client.search({ since })

      console.log(
        `[IMAP] 搜索到 ${searchResults?.length || 0} 封最近 24 小时的邮件，过滤条件：收件人包含 ${tempEmailAddress}`
      )

      if (!searchResults || searchResults.length === 0) {
        console.log('[IMAP] 未找到任何邮件')
        return []
      }

      // 获取所有搜索结果的邮件
      const uids = searchResults

      // 获取邮件头信息
      for await (const msg of client.fetch(uids, {
        envelope: true,
        uid: true,
        bodyStructure: true,
        internalDate: true,
      })) {
        const envelope = msg.envelope
        const receivedAt = msg.internalDate || new Date()

        // 1. 验证邮件接收时间是否在 24 小时内
        if (receivedAt.getTime() < since.getTime()) {
          continue
        }

        // 2. 严格验证收件人地址是否与临时邮箱完全匹配
        const toAddresses =
          envelope.to?.map((addr: any) => addr.address?.toLowerCase()) || []
        const ccAddresses =
          envelope.cc?.map((addr: any) => addr.address?.toLowerCase()) || []
        const bccAddresses =
          envelope.bcc?.map((addr: any) => addr.address?.toLowerCase()) || []

        const allRecipients = [...toAddresses, ...ccAddresses, ...bccAddresses]
        const tempEmailLower = tempEmailAddress.toLowerCase()

        // 只保留发送到临时邮箱地址的邮件（完全匹配）
        if (!allRecipients.includes(tempEmailLower)) {
          continue
        }

        messages.push({
          id: msg.uid.toString(),
          from: this.parseEmailContact(envelope.from?.[0]),
          to:
            envelope.to?.map((addr: any) => this.parseEmailContact(addr)) || [],
          cc: envelope.cc?.map((addr: any) => this.parseEmailContact(addr)),
          subject: envelope.subject || '(无主题)',
          textContent: undefined,
          htmlContent: undefined,
          receivedAt,
          isRead: msg.flags?.has('\\Seen') || false,
          size: msg.size,
          provider: this.name,
          messageId: envelope.messageId,
        })
      }

      // 按时间倒序排列（最新的在前）
      messages.sort((a, b) => b.receivedAt.getTime() - a.receivedAt.getTime())

      console.log(`[IMAP] 过滤后返回 ${messages.length} 封邮件`)

      return messages
    } catch (error: any) {
      console.error('[IMAP] 获取邮件列表失败:', {
        error: error.message || error,
        code: error.code,
        stack: error.stack,
      })
      throw error
    }
  }

  /**
   * 获取邮件完整内容
   */
  private async fetchMessageContent(
    client: any,
    emailId: string
  ): Promise<EmailMessage> {
    try {
      const uid = parseInt(emailId, 10)

      // 获取完整邮件 (使用 UID 模式)
      const message = await client.fetchOne(
        uid,
        {
          envelope: true,
          uid: true,
          bodyStructure: true,
          internalDate: true,
          source: true,
        },
        { uid: true }
      ) // ✅ 指定第一个参数是 UID 而不是序列号

      if (!message) {
        throw new Error(`邮件不存在: ${emailId}`)
      }

      const envelope = message.envelope

      // 解析邮件内容
      let textContent: string | undefined
      let htmlContent: string | undefined

      // 查找 text/plain 和 text/html 部分
      const textPart = this.findBodyPart(message.bodyStructure, 'text/plain')
      const htmlPart = this.findBodyPart(message.bodyStructure, 'text/html')

      try {
        // 获取文本部分
        if (textPart) {
          const download = await client.download(uid, textPart, { uid: true })
          if (download && download.content) {
            // download.content 是一个 ReadableStream,需要读取流内容
            const chunks: Buffer[] = []
            for await (const chunk of download.content) {
              chunks.push(chunk)
            }
            const buffer = Buffer.concat(chunks)
            textContent = buffer.toString('utf-8')
          }
        }
      } catch (error) {
        console.error(`[IMAP] 邮件 ${emailId} - 获取文本内容失败:`, error)
      }

      try {
        // 获取 HTML 部分
        if (htmlPart) {
          const download = await client.download(uid, htmlPart, { uid: true })
          if (download && download.content) {
            // download.content 是一个 ReadableStream,需要读取流内容
            const chunks: Buffer[] = []
            for await (const chunk of download.content) {
              chunks.push(chunk)
            }
            const buffer = Buffer.concat(chunks)
            htmlContent = buffer.toString('utf-8')
          }
        }
      } catch (error) {
        console.error(`[IMAP] 邮件 ${emailId} - 获取 HTML 内容失败:`, error)
      }

      // 如果都没有获取到，尝试解析原始邮件源码
      if (!textContent && !htmlContent && message.source) {
        try {
          const parsed = this.parseEmailSource(message.source.toString())
          textContent = parsed.text
          htmlContent = parsed.html
        } catch (error) {
          console.error(`[IMAP] 邮件 ${emailId} - 解析邮件源码失败:`, error)
        }
      }

      // 查找附件
      const attachments = this.findAttachments(message.bodyStructure)

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
        messageId: envelope.messageId,
      }
    } catch (error: any) {
      console.error('[IMAP] 获取邮件内容失败:', {
        emailId,
        error: error.message || error,
        code: error.code,
        stack: error.stack,
      })
      throw error
    }
  }

  /**
   * 在 bodyStructure 中查找指定类型的部分
   */
  private findBodyPart(structure: any, mimeType: string): string | null {
    if (!structure) return null

    // 获取完整的 MIME type
    // ImapFlow 可能返回:
    // 1. structure.type = "text/plain" (完整格式)
    // 2. structure.type = "text", structure.subtype = "plain" (分开格式)
    let fullType: string
    const typeStr = structure.type?.toLowerCase() || ''

    if (typeStr.includes('/')) {
      // 已经是完整的 MIME type
      fullType = typeStr
    } else {
      // 需要拼接 type 和 subtype
      const subtypeStr = structure.subtype?.toLowerCase() || ''
      fullType = subtypeStr ? `${typeStr}/${subtypeStr}` : typeStr
    }

    // 检查是否匹配目标 MIME type
    if (fullType === mimeType.toLowerCase()) {
      // 优先使用 structure.part,否则使用 '1'
      return structure.part || '1'
    }

    // 如果是 multipart，递归查找子部分
    if (
      fullType.startsWith('multipart/') &&
      Array.isArray(structure.childNodes)
    ) {
      for (const childNode of structure.childNodes) {
        const result = this.findBodyPart(childNode, mimeType)
        if (result) return result
      }
    }

    return null
  }

  /**
   * 在 bodyStructure 中查找附件
   */
  private findAttachments(structure: any, attachments: any[] = []): any[] {
    if (!structure) return attachments

    // 获取完整的 MIME type (同 findBodyPart 的逻辑)
    let fullType: string
    const typeStr = structure.type?.toLowerCase() || ''

    if (typeStr.includes('/')) {
      fullType = typeStr
    } else {
      const subtypeStr = structure.subtype?.toLowerCase() || ''
      fullType = subtypeStr ? `${typeStr}/${subtypeStr}` : typeStr
    }

    const disposition = structure.disposition?.toLowerCase()
    const dispositionParams = structure.dispositionParameters || {}

    // 判断是否为附件:
    // 1. disposition 为 'attachment' 或 'inline'
    // 2. 或者有 filename 参数
    // 3. 排除 text/plain 和 text/html (这些是邮件正文)
    const isAttachment =
      disposition === 'attachment' ||
      disposition === 'inline' ||
      dispositionParams.filename ||
      structure.parameters?.name

    const isTextContent = fullType === 'text/plain' || fullType === 'text/html'

    if (isAttachment && !isTextContent) {
      const filename =
        dispositionParams.filename ||
        structure.parameters?.name ||
        `attachment-${attachments.length + 1}`

      attachments.push({
        id: structure.part || `${attachments.length + 1}`,
        filename: filename,
        contentType: fullType,
        size: structure.size || 0,
        inline: disposition === 'inline',
        contentId: structure.id,
      })
    }

    // 如果是 multipart，递归查找子部分
    if (
      fullType.startsWith('multipart/') &&
      Array.isArray(structure.childNodes)
    ) {
      for (const childNode of structure.childNodes) {
        this.findAttachments(childNode, attachments)
      }
    }

    return attachments
  }

  /**
   * 简单解析邮件源码（提取文本和 HTML 内容）
   */
  private parseEmailSource(source: Buffer): { text?: string; html?: string } {
    const content = source.toString('utf-8')
    const result: { text?: string; html?: string } = {}

    // 简单的 MIME 解析（查找 text/plain 和 text/html 部分）
    const textMatch = content.match(
      /Content-Type: text\/plain[\s\S]*?\n\n([\s\S]*?)(?=\n--|\n\r\n--|\r\n--|\Z)/i
    )
    const htmlMatch = content.match(
      /Content-Type: text\/html[\s\S]*?\n\n([\s\S]*?)(?=\n--|\n\r\n--|\r\n--|\Z)/i
    )

    if (textMatch && textMatch[1]) {
      result.text = textMatch[1].trim()
    }

    if (htmlMatch && htmlMatch[1]) {
      result.html = htmlMatch[1].trim()
    }

    // 如果没有找到 MIME 部分，可能是纯文本邮件
    if (!result.text && !result.html) {
      const bodyMatch = content.match(/\n\n([\s\S]+)$/)
      if (bodyMatch && bodyMatch[1]) {
        result.text = bodyMatch[1].trim()
      }
    }

    return result
  }

  /**
   * 生成 accessToken（包含临时邮箱地址和真实 IMAP 配置）
   * 每次生成都会添加当前时间戳，确保密文唯一性
   */
  private async generateAccessToken(
    config: ImapConfig,
    tempEmailAddress: string
  ): Promise<string> {
    const encryptEnabled = process.env.IMAP_ENCRYPT_TOKEN === 'true'

    const session: ImapSession = {
      tempEmailAddress,
      imapConfig: config,
      timestamp: Date.now(), // 添加时间戳确保每次生成的 token 不同
    }

    if (encryptEnabled) {
      // 加密模式
      const encryptionKey = process.env.IMAP_ENCRYPTION_KEY
      if (!encryptionKey) {
        throw new Error(
          'IMAP_ENCRYPTION_KEY 环境变量未设置（启用加密时必须设置）'
        )
      }
      return await CryptoUtil.encryptImapSession(session, encryptionKey)
    } else {
      // 不加密模式（仅 Base64 编码）
      return CryptoUtil.encodeImapSession(session)
    }
  }

  /**
   * 解析 accessToken（获取临时邮箱地址和真实 IMAP 配置）
   * 支持可选的 token 过期验证（通过 IMAP_TOKEN_TTL_HOURS 环境变量配置）
   */
  private async parseAccessToken(token: string): Promise<ImapSession> {
    const encryptEnabled = process.env.IMAP_ENCRYPT_TOKEN === 'true'

    try {
      let session: ImapSession

      if (encryptEnabled) {
        // 解密模式
        const encryptionKey = process.env.IMAP_ENCRYPTION_KEY
        if (!encryptionKey) {
          throw new Error('IMAP_ENCRYPTION_KEY 环境变量未设置')
        }
        session = await CryptoUtil.decryptImapSession(token, encryptionKey)
      } else {
        // 不加密模式（Base64 解码）
        session = CryptoUtil.decodeImapSession(token)
      }

      // 验证 token 是否过期（如果配置了有效期且 session 包含时间戳）
      this.validateTokenExpiration(session)

      return session
    } catch (error) {
      if (error instanceof Error && error.message.includes('已过期')) {
        throw error // 保留过期错误的具体信息
      }
      throw new Error('无效的 accessToken')
    }
  }

  /**
   * 验证 token 是否过期
   * 通过环境变量 IMAP_TOKEN_TTL_HOURS 配置有效期（小时），默认不限制
   */
  private validateTokenExpiration(session: ImapSession): void {
    const ttlHours = parseInt(process.env.IMAP_TOKEN_TTL_HOURS || '0', 10)

    // 未配置有效期或值为 0，不做过期检查
    if (ttlHours <= 0) {
      return
    }

    // 兼容旧 token（没有时间戳的 token 不做过期检查）
    if (!session.timestamp) {
      return
    }

    const now = Date.now()
    const tokenAge = now - session.timestamp
    const ttlMs = ttlHours * 60 * 60 * 1000

    if (tokenAge > ttlMs) {
      throw new Error(
        `accessToken 已过期（有效期 ${ttlHours} 小时），请重新创建邮箱`
      )
    }
  }

  /**
   * 解析邮件联系人
   */
  private parseEmailContact(addr: any): EmailContact {
    if (!addr) {
      return { email: 'unknown@unknown.com' }
    }

    return {
      email: addr.address || 'unknown@unknown.com',
      name: addr.name,
    }
  }

  /**
   * 检测是否在 Cloudflare Workers 环境
   */
  private isCloudflareWorkers(): boolean {
    return (
      typeof (globalThis as any).caches !== 'undefined' &&
      typeof (globalThis as any).WebSocketPair !== 'undefined'
    )
  }

  /**
   * 验证邮箱格式
   */
  private isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  }

  /**
   * 更新平均响应时间
   */
  private updateResponseTime(responseTime: number): void {
    const total = this.stats.totalRequests
    this.stats.averageResponseTime =
      (this.stats.averageResponseTime * (total - 1) + responseTime) / total
    this.stats.lastRequestTime = new Date()
  }

  /**
   * 错误处理
   */
  private handleError(error: unknown, operation: string): ChannelResponse<any> {
    const errorMessage = error instanceof Error ? error.message : String(error)

    // 详细错误信息（不包含建议）
    let detailedErrorMessage = errorMessage
    let errorType = ChannelErrorType.UNKNOWN_ERROR
    let errorDetails: any = undefined

    // 根据错误类型提供详细信息
    if (
      errorMessage.includes('ECONNREFUSED') ||
      errorMessage.includes('ETIMEDOUT')
    ) {
      detailedErrorMessage = 'IMAP 连接失败：无法连接到服务器'
      errorType = ChannelErrorType.NETWORK_ERROR
      errorDetails = {
        reason: '网络连接失败或服务器地址错误',
        operation,
      }
    } else if (
      errorMessage.includes('AUTHENTICATIONFAILED') ||
      errorMessage.includes('Invalid credentials')
    ) {
      detailedErrorMessage = 'IMAP 认证失败：用户名或密码错误'
      errorType = ChannelErrorType.AUTHENTICATION_ERROR
      errorDetails = {
        reason: '认证信息无效',
        operation,
      }
    } else if (errorMessage.includes('Mailbox does not exist')) {
      detailedErrorMessage = 'IMAP 操作失败：邮箱目录不存在'
      errorType = ChannelErrorType.API_ERROR
      errorDetails = {
        reason: '指定的邮箱目录不存在',
        operation,
      }
    }

    console.error(`IMAP Provider ${operation} 失败:`, errorMessage)

    // 创建符合 ChannelError 接口的错误对象
    const channelError: ChannelError = Object.assign(
      new Error(detailedErrorMessage),
      {
        type: errorType,
        channelName: this.name,
        retryable: errorType === ChannelErrorType.NETWORK_ERROR,
        timestamp: new Date(),
        context: errorDetails,
      }
    )

    return {
      success: false,
      error: channelError,
      metadata: {
        provider: this.name,
        responseTime: 0,
        timestamp: new Date().toISOString(),
        operation,
        details: errorDetails,
      },
    }
  }
}
