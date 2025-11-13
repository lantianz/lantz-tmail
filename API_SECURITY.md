# API 安全配置

## 概述

TempMailHub 支持可选的 API Key 认证机制，提供灵活的安全控制：

- **未配置 API Key**：所有端点公开访问
- **已配置 API Key**：核心邮件操作端点需要认证

## 配置方式

### 环境变量设置

设置环境变量 `TEMPMAILHUB_API_KEY` 来启用认证：

```bash
# 本地开发
export TEMPMAILHUB_API_KEY="your-secret-api-key-here"

# 或在 .env 文件中
TEMPMAILHUB_API_KEY=your-secret-api-key-here
```

### 平台特定配置

#### Cloudflare Workers

1. **方式一：wrangler.toml**
```toml
[vars]
TEMPMAILHUB_API_KEY = "your-secret-api-key"
```

2. **方式二：Cloudflare Dashboard**
- 进入 Workers & Pages → 你的项目 → Settings → Environment Variables
- 添加变量：`TEMPMAILHUB_API_KEY`

#### Vercel

```bash
vercel env add TEMPMAILHUB_API_KEY
```

或在 Vercel Dashboard 的项目设置中添加环境变量。

#### Netlify

在 Netlify Dashboard 的项目设置 → Environment Variables 中添加：
- Key: `TEMPMAILHUB_API_KEY`
- Value: `your-secret-api-key`

#### Docker

```bash
docker run -e TEMPMAILHUB_API_KEY="your-secret-api-key" your-image
```

## 端点分类

### 🔓 公开端点（无需认证）

- `GET /health` - 健康检查
- `GET /api/info` - API 信息
- `POST /api/mail/providers/test-connections` - 测试连接
- `GET /api/mail/providers/stats` - 提供者统计

### 🔒 受保护端点（需要认证）

- `POST /api/mail/create` - 创建临时邮箱
- `POST /api/mail/list` - 获取邮件列表
- `POST /api/mail/content` - 获取邮件详情

## 客户端使用

### 认证方式

使用标准的 Bearer Token 认证：

```bash
curl -H "Authorization: Bearer your-api-key" \
     -X POST http://localhost:8787/api/mail/create \
     -H "Content-Type: application/json" \
     -d '{"provider": "minmail"}'
```

### JavaScript 示例

```javascript
const API_KEY = 'your-api-key';
const BASE_URL = 'https://your-domain.com';

const headers = {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${API_KEY}`
};

// 创建邮箱
const response = await fetch(`${BASE_URL}/api/mail/create`, {
  method: 'POST',
  headers,
  body: JSON.stringify({ provider: 'minmail' })
});

const result = await response.json();
```

### Python 示例

```python
import requests

API_KEY = 'your-api-key'
BASE_URL = 'https://your-domain.com'

headers = {
    'Content-Type': 'application/json',
    'Authorization': f'Bearer {API_KEY}'
}

# 创建邮箱
response = requests.post(
    f'{BASE_URL}/api/mail/create',
    headers=headers,
    json={'provider': 'minmail'}
)

result = response.json()
```

## 错误响应

### 缺少 API Key

```json
{
  "success": false,
  "error": "API Key required. Please provide API Key via Authorization header: \"Bearer <your-api-key>\"",
  "timestamp": "2025-08-03T10:00:00.000Z"
}
```

**HTTP 状态码**: `401 Unauthorized`

### 无效 API Key

```json
{
  "success": false,
  "error": "Invalid API Key",
  "timestamp": "2025-08-03T10:00:00.000Z"
}
```

**HTTP 状态码**: `401 Unauthorized`

## 安全建议

### API Key 生成

推荐使用强随机字符串作为 API Key：

```bash
# 生成 32 字符随机 API Key
openssl rand -hex 32

# 或使用 UUID
uuidgen

# 或自定义格式
echo "tmh_$(openssl rand -hex 16)"
```

### 最佳实践

1. **定期轮换**: 定期更换 API Key
2. **环境隔离**: 不同环境使用不同的 API Key
3. **访问控制**: 只给需要的服务分配 API Key
4. **监控日志**: 监控 API 使用情况和失败请求
5. **HTTPS**: 始终使用 HTTPS 传输 API Key

### 存储安全

❌ **不要这样做**:
- 硬编码在源代码中
- 提交到版本控制系统
- 在日志中打印完整 API Key

✅ **推荐做法**:
- 使用环境变量
- 使用密钥管理服务
- 在日志中只显示前几位字符

## 测试

使用提供的测试脚本验证认证功能：

```bash
# 不设置 API Key（公开模式）
./test-api-auth.sh

# 设置 API Key（认证模式）
export TEMPMAILHUB_API_KEY="your-test-api-key"
./test-api-auth.sh
```

## 状态检查

访问 `/api/info` 端点查看当前认证状态：

```bash
curl http://localhost:8787/api/info | jq '.data.authentication'
```

响应示例：

```json
{
  "enabled": true,
  "method": "Bearer Token",
  "header": "Authorization: Bearer <api-key>",
  "note": "API Key authentication is enabled. Protected endpoints require valid API key."
}
``` 