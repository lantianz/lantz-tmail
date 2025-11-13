// 邮件地址信息
export interface EmailAddress {
  address: string;
  domain: string;
  username: string;
  expiresAt?: Date;
  createdAt: Date;
  provider: string;
  isActive: boolean;
  metadata?: Record<string, any>;
}

// 邮件内容
export interface EmailMessage {
  id: string;
  from: EmailContact;
  to: EmailContact[];
  cc?: EmailContact[];
  bcc?: EmailContact[];
  subject: string;
  textContent?: string;
  htmlContent?: string;
  attachments?: EmailAttachment[];
  receivedAt: Date;
  isRead: boolean;
  size?: number;
  provider: string;
  messageId?: string;
  inReplyTo?: string;
  references?: string[];
  headers?: Record<string, string>;
}

// 邮件联系人
export interface EmailContact {
  email: string;
  name?: string;
}

// 邮件附件
export interface EmailAttachment {
  id: string;
  filename: string;
  contentType: string;
  size: number;
  downloadUrl?: string;
  inline?: boolean;
  contentId?: string;
}

// 邮件列表查询参数
export interface EmailListQuery {
  address: string;
  provider?: string;
  accessToken?: string;  // 可选的访问令牌，有些provider需要
  limit?: number;
  offset?: number;
  since?: Date;
  unreadOnly?: boolean;
}

// 邮件统计信息
export interface EmailStats {
  totalEmails: number;
  unreadEmails: number;
  oldestEmail?: Date;
  newestEmail?: Date;
  providers: {
    [provider: string]: number;
  };
}

// 创建邮箱的请求参数
export interface CreateEmailRequest {
  provider?: string;
  domain?: string;
  prefix?: string;
  expirationMinutes?: number;
}

// 创建邮箱的响应
export interface CreateEmailResponse {
  address: string;
  domain: string;
  username: string;
  expiresAt?: Date;
  provider: string;
  recoveryKey?: string;
  accessToken?: string;
} 