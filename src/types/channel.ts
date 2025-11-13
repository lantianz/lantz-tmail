import type { EmailAddress, EmailMessage, CreateEmailRequest, CreateEmailResponse, EmailListQuery } from './email.js';

// 渠道状态
export enum ChannelStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  ERROR = 'error',
  RATE_LIMITED = 'rate_limited',
  MAINTENANCE = 'maintenance'
}

// 渠道能力
export interface ChannelCapabilities {
  createEmail: boolean;
  listEmails: boolean;
  getEmailContent: boolean;
  customDomains: boolean;
  customPrefix: boolean;
  emailExpiration: boolean;
  realTimeUpdates: boolean;
  attachmentSupport: boolean;
}

// 渠道配置
export interface ChannelConfiguration {
  name: string;
  enabled: boolean;
  priority: number;
  baseUrl: string;
  apiKey?: string;
  headers?: Record<string, string>;
  timeout: number;
  retries: number;
  rateLimit: {
    requests: number;
    window: number;
  };
  capabilities: ChannelCapabilities;
  domains?: string[];
  metadata?: Record<string, any>;
}

// 渠道健康状态
export interface ChannelHealth {
  status: ChannelStatus;
  lastChecked: Date;
  responseTime?: number;
  errorCount: number;
  successRate: number;
  lastError?: string;
  uptime: number; // 正常运行时间百分比
}

// 渠道统计信息
export interface ChannelStats {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageResponseTime: number;
  lastRequestTime?: Date;
  errorsToday: number;
  requestsToday: number;
}

// 渠道错误类型
export enum ChannelErrorType {
  NETWORK_ERROR = 'network_error',
  API_ERROR = 'api_error',
  RATE_LIMIT_ERROR = 'rate_limit_error',
  AUTHENTICATION_ERROR = 'authentication_error',
  CONFIGURATION_ERROR = 'configuration_error',
  TIMEOUT_ERROR = 'timeout_error',
  UNKNOWN_ERROR = 'unknown_error'
}

// 渠道错误
export interface ChannelError extends Error {
  type: ChannelErrorType;
  channelName: string;
  statusCode?: number;
  retryable: boolean;
  timestamp: Date;
  context?: Record<string, any>;
}

// 渠道响应元数据
export interface ChannelResponseMetadata {
  provider: string;
  responseTime: number;
  requestId: string;
  cached?: boolean;
  retryCount?: number;
}

// 渠道接口方法的响应类型
export interface ChannelResponse<T> {
  success: boolean;
  data?: T;
  error?: ChannelError;
  metadata: ChannelResponseMetadata;
} 