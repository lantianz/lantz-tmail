# IMAP TLS 连接问题排查指南

## 问题描述

在使用 IMAP Provider 时，可能会遇到以下 TLS 连接错误：

```
Client network socket disconnected before secure TLS connection was established
```

这个错误通常发生在 TLS 握手过程中连接被意外断开。

## 解决方案

### 1. 自动修复功能

项目已经实现了以下自动修复机制：

#### TLS 配置优化
- **智能 TLS 版本选择**: 支持 TLSv1.2 和 TLSv1.3
- **服务器名称指示 (SNI)**: 自动设置正确的服务器名称
- **握手超时控制**: 设置 30 秒握手超时
- **会话重用**: 启用 TLS 会话重用以提高性能

#### 邮件服务商特定优化
- **Gmail**: 使用优化的加密套件
- **Outlook/Hotmail**: 强制使用 TLSv1.2
- **中国邮件服务商** (QQ、163、126): 放宽证书验证

#### 连接重试机制
- **自动重试**: TLS 连接失败时自动重试最多 3 次
- **指数退避**: 重试间隔逐渐增加 (1s, 2s, 4s)
- **智能错误识别**: 只对可重试的错误进行重试

### 2. 环境变量配置

在 `.env` 文件中添加以下配置：

```bash
# IMAP 连接超时时间（毫秒，默认：120000 = 120秒）
IMAP_TIMEOUT=120000

# 是否启用严格 TLS 验证（默认：true，设置为 false 可解决某些 TLS 连接问题）
IMAP_STRICT_TLS=true
```

#### 配置说明

- `IMAP_TIMEOUT`: 控制连接超时时间，可以根据网络情况调整
- `IMAP_STRICT_TLS`: 控制 TLS 验证严格性
  - `true` (默认): 启用严格 TLS 验证，更安全
  - `false`: 放宽 TLS 验证，可解决某些证书问题

### 3. 手动排查步骤

如果仍然遇到问题，可以按以下步骤排查：

#### 步骤 1: 检查网络连接
```bash
# 测试服务器连通性
telnet imap.gmail.com 993
```

#### 步骤 2: 验证 IMAP 配置
```bash
# 使用测试脚本验证连接
node test-imap-connection.js your-email@gmail.com your-app-password
```

#### 步骤 3: 调整 TLS 设置
如果严格 TLS 验证导致问题，可以临时禁用：

```bash
# 在 .env 文件中设置
IMAP_STRICT_TLS=false
```

#### 步骤 4: 检查防火墙和代理
- 确保端口 993 (IMAPS) 或 143 (IMAP) 未被阻止
- 如果使用代理，确保代理支持 TLS 连接

### 4. 常见邮件服务商配置

#### Gmail
```json
{
  "imap_server": "imap.gmail.com",
  "imap_port": 993,
  "imap_user": "your-email@gmail.com",
  "imap_pass": "your-app-password"
}
```

#### Outlook/Hotmail
```json
{
  "imap_server": "outlook.office365.com",
  "imap_port": 993,
  "imap_user": "your-email@outlook.com",
  "imap_pass": "your-password"
}
```

#### QQ 邮箱
```json
{
  "imap_server": "imap.qq.com",
  "imap_port": 993,
  "imap_user": "your-email@qq.com",
  "imap_pass": "your-authorization-code"
}
```

### 5. 错误日志分析

查看控制台输出中的错误信息：

- `socket disconnected`: TLS 握手失败，已自动重试
- `ECONNREFUSED`: 服务器拒绝连接，检查服务器地址和端口
- `AUTHENTICATIONFAILED`: 认证失败，检查邮箱地址和密码
- `ETIMEDOUT`: 连接超时，可能是网络问题

## 测试连接

使用提供的测试脚本验证修复效果：

```bash
node test-imap-connection.js your-email@gmail.com your-app-password
```

## 技术细节

### TLS 配置优化
- 支持现代 TLS 版本 (1.2, 1.3)
- 智能加密套件选择
- 服务器身份验证优化
- 连接池管理改进

### 错误处理增强
- 详细的错误分类和提示
- 自动连接池清理
- 智能重试策略
- 完整的错误上下文信息

这些改进应该能够解决大部分 TLS 连接问题，提供更稳定的 IMAP 连接体验。
