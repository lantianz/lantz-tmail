import type {
  EmailAddress,
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
  ChannelCapabilities
} from '../types/channel.js';

/**
 * 邮件提供者统一接口
 * 所有邮件渠道适配器都必须实现此接口
 */
export interface IMailProvider {
  /**
   * 渠道名称（唯一标识）
   */
  readonly name: string;

  /**
   * 渠道能力描述
   */
  readonly capabilities: ChannelCapabilities;

  /**
   * 渠道配置
   */
  readonly config: ChannelConfiguration;

  /**
   * 初始化渠道
   * @param config 渠道配置
   */
  initialize(config: ChannelConfiguration): Promise<void>;

  /**
   * 创建临时邮箱地址
   * @param request 创建请求参数
   * @returns 创建的邮箱信息
   */
  createEmail(request: CreateEmailRequest): Promise<ChannelResponse<CreateEmailResponse>>;

  /**
   * 获取邮件列表
   * @param query 查询参数 (包含可选的accessToken)
   * @returns 邮件列表
   */
  getEmails(query: EmailListQuery): Promise<ChannelResponse<EmailMessage[]>>;

  /**
   * 获取单个邮件的详细内容
   * @param emailAddress 邮箱地址
   * @param emailId 邮件ID
   * @param accessToken 可选的访问令牌
   * @returns 邮件详细内容
   */
  getEmailContent(emailAddress: string, emailId: string, accessToken?: string): Promise<ChannelResponse<EmailMessage>>;

  /**
   * 验证邮箱地址是否存在且有效
   * @param emailAddress 邮箱地址
   * @returns 邮箱信息
   */


  /**
   * 删除邮箱（如果支持）
   * @param emailAddress 邮箱地址
   * @returns 删除结果
   */
  deleteEmail?(emailAddress: string): Promise<ChannelResponse<boolean>>;

  /**
   * 获取渠道健康状态
   * @returns 健康状态信息
   */
  getHealth(): Promise<ChannelHealth>;

  /**
   * 获取渠道统计信息
   * @returns 统计信息
   */
  getStats(): ChannelStats;

  /**
   * 测试渠道连接
   * @returns 测试结果
   */
  testConnection(): Promise<ChannelResponse<boolean>>;

  /**
   * 清理过期数据（如果需要）
   */
  cleanup?(): Promise<void>;
}

/**
 * 邮件提供者工厂接口
 */
export interface IMailProviderFactory {
  /**
   * 创建邮件提供者实例
   * @param name 提供者名称
   * @param config 配置信息
   * @returns 提供者实例
   */
  createProvider(name: string, config: ChannelConfiguration): IMailProvider;

  /**
   * 获取支持的提供者列表
   * @returns 提供者名称列表
   */
  getSupportedProviders(): string[];

  /**
   * 检查是否支持指定提供者
   * @param name 提供者名称
   * @returns 是否支持
   */
  isProviderSupported(name: string): boolean;
}

/**
 * 提供者管理器接口
 */
export interface IProviderManager {
  /**
   * 注册邮件提供者
   * @param provider 提供者实例
   */
  registerProvider(provider: IMailProvider): void;

  /**
   * 获取指定提供者
   * @param name 提供者名称
   * @returns 提供者实例
   */
  getProvider(name: string): IMailProvider | undefined;

  /**
   * 获取所有启用的提供者
   * @returns 提供者实例列表
   */
  getEnabledProviders(): IMailProvider[];

  /**
   * 获取最佳提供者（根据优先级和健康状态）
   * @param capabilities 需要的能力
   * @returns 最佳提供者
   */
  getBestProvider(capabilities?: Partial<ChannelCapabilities>): IMailProvider | undefined;

  /**
   * 获取所有提供者的健康状态
   * @returns 健康状态映射
   */
  getAllHealth(): Promise<Record<string, ChannelHealth>>;

  /**
   * 获取所有提供者的统计信息
   * @returns 统计信息映射
   */
  getAllStats(): Record<string, ChannelStats>;

  /**
   * 重新加载配置
   */
  reloadConfig(): Promise<void>;
} 