// 基础配置类型
export interface Config {
  channels: ChannelConfig;
  server: ServerConfig;
  security: SecurityConfig;
}

// 渠道配置
export interface ChannelConfig {
  [key: string]: {
    enabled: boolean;
    priority: number;
    rateLimit?: {
      requests: number;
      window: number; // 时间窗口（秒）
    };
    timeout?: number; // 请求超时时间（毫秒）
    retries?: number; // 重试次数
  };
}

// 服务器配置
export interface ServerConfig {
  port?: number;
  host?: string;
  cors?: {
    origin: string[];
    methods: string[];
    headers: string[];
  };
}

// 安全配置
export interface SecurityConfig {
  apiKey?: string;
  rateLimit?: {
    enabled: boolean;
    requests: number;
    window: number;
  };
}

// API 响应基础类型
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: string;
  provider?: string;
}

// 分页类型
export interface Pagination {
  page: number;
  limit: number;
  total?: number;
  hasMore?: boolean;
}

// 请求上下文
export interface RequestContext {
  requestId: string;
  userAgent?: string;
  ip?: string;
  timestamp: Date;
}

export * from './email.js';
export * from './channel.js'; 