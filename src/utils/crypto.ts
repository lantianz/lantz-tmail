import type { ImapConfig, ImapSession } from '../types/email.js';

/**
 * 加密工具类
 * 用于加密和解密 IMAP 配置信息
 */
export class CryptoUtil {
  /**
   * 加密 IMAP 会话信息
   * @param session IMAP 会话对象（包含临时邮箱地址和真实配置）
   * @param secretKey 加密密钥
   * @returns Base64 编码的加密字符串
   */
  static async encryptImapSession(session: ImapSession, secretKey: string): Promise<string> {
    const crypto = await import('crypto');
    
    // 生成随机 IV (16 字节)
    const iv = crypto.randomBytes(16);
    
    // 创建密钥（SHA-256 哈希，32 字节）
    const key = crypto.createHash('sha256').update(secretKey).digest();
    
    // 创建加密器 (AES-256-GCM)
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    
    // 加密数据
    const plaintext = JSON.stringify(session);
    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    // 获取认证标签 (16 字节)
    const authTag = cipher.getAuthTag();

    // 组合 IV + AuthTag + 密文
    const combined = Buffer.concat([
      iv,
      authTag,
      Buffer.from(encrypted, 'hex')
    ]);

    // Base64 编码
    return combined.toString('base64');
  }

  /**
   * 解密 IMAP 会话信息
   * @param token Base64 编码的加密字符串
   * @param secretKey 加密密钥
   * @returns IMAP 会话对象
   */
  static async decryptImapSession(token: string, secretKey: string): Promise<ImapSession> {
    const crypto = await import('crypto');
    
    // Base64 解码
    const combined = Buffer.from(token, 'base64');
    
    // 分离 IV、AuthTag 和密文
    const iv = combined.subarray(0, 16);
    const authTag = combined.subarray(16, 32);
    const encrypted = combined.subarray(32);
    
    // 创建密钥
    const key = crypto.createHash('sha256').update(secretKey).digest();
    
    // 创建解密器
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    
    // 解密数据
    let decrypted = decipher.update(encrypted.toString('hex'), 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    // 解析 JSON
    return JSON.parse(decrypted);
  }
  
  /**
   * 编码 IMAP 会话信息（不加密，仅 Base64）
   * @param session IMAP 会话对象
   * @returns Base64 编码的字符串
   */
  static encodeImapSession(session: ImapSession): string {
    return Buffer.from(JSON.stringify(session)).toString('base64');
  }

  /**
   * 解码 IMAP 会话信息（不加密，仅 Base64）
   * @param token Base64 编码的字符串
   * @returns IMAP 会话对象
   */
  static decodeImapSession(token: string): ImapSession {
    const json = Buffer.from(token, 'base64').toString('utf-8');
    return JSON.parse(json);
  }
}

