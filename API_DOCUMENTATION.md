# TempMailHub API 文档

## 🏗️ 系统架构

### 整体架构图

```mermaid
graph LR
    Client[客户端] --> Auth[API认证中间件]
    Auth --> Service[邮件服务层]
    Service --> Manager[Provider管理器]
    Manager --> Adapter[Provider适配器]
    Adapter --> External[外部API]

    %% 样式设置
    classDef clientClass fill:#e3f2fd,stroke:#1976d2,stroke-width:2px
    classDef authClass fill:#f3e5f5,stroke:#7b1fa2,stroke-width:2px
    classDef serviceClass fill:#e8f5e8,stroke:#388e3c,stroke-width:2px
    classDef managerClass fill:#fff3e0,stroke:#f57c00,stroke-width:2px
    classDef adapterClass fill:#fce4ec,stroke:#c2185b,stroke-width:2px
    classDef externalClass fill:#ffebee,stroke:#d32f2f,stroke-width:2px

    class Client clientClass
    class Auth authClass
    class Service serviceClass
    class Manager managerClass
    class Adapter adapterClass
    class External externalClass
```

**架构说明**：
- 📱 **客户端**：发起API请求（Web、Mobile、API Client等）
- 🔐 **API认证中间件**：验证TempMailHub API Key
- 🔧 **邮件服务层**：核心业务逻辑，统一接口处理
- 📋 **Provider管理器**：智能选择最优Provider，性能优先级管理
- 🔌 **Provider适配器**：统一各邮件服务商的接口适配
- 🌐 **外部API**：各个临时邮箱服务提供商的原生API

### 数据流时序图

```mermaid
sequenceDiagram
    participant Client as 客户端
    participant Auth as API认证中间件
    participant Service as 邮件服务层
    participant Manager as Provider管理器
    participant Adapter as Provider适配器
    participant External as 外部API

    Note over Client,External: 创建邮箱流程

    Client->>+Auth: POST /api/mail/create<br/>Bearer Token + {provider?, domain?, prefix?}
    Auth->>Auth: 验证API Key
    Auth->>+Service: createEmail(request)
    Service->>Service: 分析capabilities需求<br/>(customDomains, customPrefix, etc.)
    
    alt 指定了provider
        Service->>+Manager: getProvider(providerName)
    else 自动选择
        Service->>+Manager: getBestProvider(capabilities)
        Manager->>Manager: 性能优先级排序<br/>(TempMailPlus > MinMail > ...)
    end
    
    Manager-->>-Service: 返回Provider实例
    Service->>+Adapter: createEmail(request)
    Adapter->>+External: 调用具体API<br/>(各Provider API不同)
    External-->>-Adapter: 邮箱创建成功<br/>{address, accessToken?, domain, etc.}
    Adapter-->>-Service: 返回ChannelResponse<CreateEmailResponse>
    Service-->>-Auth: 返回ApiResponse结果
    Auth-->>-Client: JSON响应 + provider名称

    Note over Client,External: 获取邮件列表流程

    Client->>+Auth: POST /api/mail/list<br/>{address, provider?, accessToken?}
    Auth->>+Service: getEmails(query)
    
    alt 指定了provider
        Service->>+Manager: getProvider(providerName)
    else 自动推断
        Service->>Service: inferProviderFromEmail(address)<br/>基于域名映射
        Service->>+Manager: getProvider(inferredName)
    end
    
    Manager-->>-Service: 返回Provider实例
    Service->>+Adapter: getEmails(query)
    Note over Adapter: query包含address, accessToken等
    Adapter->>+External: 调用邮件列表API<br/>(token处理因Provider而异)
    External-->>-Adapter: 邮件列表数据
    Adapter->>Adapter: 数据格式标准化<br/>textContent摘要处理
    Adapter-->>-Service: 返回ChannelResponse<EmailMessage[]>
    Service-->>-Auth: 返回ApiResponse结果
    Auth-->>-Client: JSON响应 + provider名称

    Note over Client,External: 获取邮件详情流程

    Client->>+Auth: POST /api/mail/content<br/>{address, id, provider?, accessToken?}
    Auth->>+Service: getEmailContent(address, id, provider?, accessToken?)
    
    alt 指定了provider
        Service->>+Manager: getProvider(providerName)
    else 自动推断
        Service->>Service: inferProviderFromEmail(address)
        Service->>+Manager: getProvider(inferredName)
    end
    
    Manager-->>-Service: 返回Provider实例
    Service->>+Adapter: getEmailContent(address, id, accessToken?)
    Adapter->>+External: 调用邮件详情API<br/>(各Provider的API路径不同)
    External-->>-Adapter: 完整邮件内容
    Adapter->>Adapter: 解析HTML/文本内容<br/>提取附件信息
    Adapter-->>-Service: 返回ChannelResponse<EmailMessage>
    Service-->>-Auth: 返回ApiResponse结果
    Auth-->>-Client: JSON响应 + provider名称
```

## 🎯 设计理念

为了简化用户对接，设计统一的邮件获取接口，用户只需要传递：
- `address`: 邮箱地址  
- `provider`: 提供商名称（可选，系统可自动推断）
- `accessToken`: 访问令牌（可选，有些提供商需要）

各提供商内部自行处理认证逻辑，用户无需关心具体的认证机制差异。

## 🔐 双层认证架构

TempMailHub 采用双层认证架构，保证服务安全性：

### 第一层：API Key 认证（TempMailHub 服务层）

保护 TempMailHub 服务本身，防止未授权访问。

**配置 API Key**

```bash
# 设置环境变量
export TEMPMAILHUB_API_KEY="your_secret_api_key_here"

# 或在 Cloudflare Workers 中设置
wrangler secret put TEMPMAILHUB_API_KEY
```

**使用 API Key**

所有受保护的接口需要在请求头中包含API Key：

```bash
Authorization: Bearer your_secret_api_key_here
```

### 第二层：Provider AccessToken（邮件提供商层）

某些邮件提供商（如 Mail.tm）需要额外的认证令牌。

**重要说明**：
- `accessToken` 会在**创建邮箱时自动返回**，无需单独获取
- 目前**只有 Mail.tm 渠道需要** `accessToken`
- `accessToken` 只能在请求体中传递，不能放在 `Authorization` 头中！

```json
{
  "address": "test@example.com",
  "accessToken": "provider_specific_token",  // 仅在请求体中
  "provider": "mailtm"
}
```

## 📋 API 接口

### 🌐 公开接口（无需认证）

- `GET /health` - 服务健康检查
- `GET /api/info` - API信息
- `POST /api/mail/providers/test-connections` - 测试所有提供者连接
- `GET /api/mail/providers/stats` - 提供者统计信息

### 🔒 受保护接口（需要API Key认证）

- `POST /api/mail/create` - 创建临时邮箱
- `POST /api/mail/list` - 获取邮件列表
- `POST /api/mail/content` - 获取邮件详情

---

## 1. 创建邮箱

**POST** `/api/mail/create`

### 基本用法

```json
{
  "provider": "mailtm", 
  "prefix": "test123",   // 可选
  "expirationMinutes": 1440  // 可选
}
```

### EtempMail 指定域名

```json
{
  "provider": "etempmail",
  "domain": "ohm.edu.pl"  // 可选：ohm.edu.pl, cross.edu.pl, usa.edu.pl, beta.edu.pl
}
```

### TempMail Plus 指定域名

```json
{
  "provider": "tempmailplus",
  "domain": "mailto.plus"  // 可选：9个域名可选
}
```

### 响应示例

**Mail.tm 提供商（包含 accessToken）**
```json
{
  "success": true,
  "data": {
    "address": "test123@somoj.com",
    "domain": "somoj.com", 
    "username": "test123",
    "provider": "mailtm",
    "accessToken": "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzUxMiJ9...",  // ⚠️ 仅 Mail.tm 返回，请保存！
    "expiresAt": "2025-08-10T07:19:38.098Z"
  },
  "timestamp": "2025-08-03T07:19:38.098Z",
  "provider": "mailtm"
}
```

**其他提供商（无 accessToken）**
```json
{
  "success": true,
  "data": {
      "address": "user123@minmail.app",
  "domain": "minmail.app",
    "username": "user123", 
    "provider": "minmail",
    // 注意：其他提供商不返回 accessToken
    "expiresAt": "2025-08-03T17:45:20.000Z"
  },
  "timestamp": "2025-08-03T07:45:20.000Z",
  "provider": "minmail"
}
```

### 测试用例

```bash
# MinMail 渠道
curl -X POST http://localhost:8787/api/mail/create \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{"provider": "minmail"}'

# TempMail Plus 渠道（支持9个域名）
curl -X POST http://localhost:8787/api/mail/create \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{"provider": "tempmailplus", "domain": "mailto.plus"}'

# Mail.tm 渠道
curl -X POST http://localhost:8787/api/mail/create \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{"provider": "mailtm"}'

# EtempMail 渠道（支持4个教育域名）
curl -X POST http://localhost:8787/api/mail/create \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{"provider": "etempmail", "domain": "ohm.edu.pl"}'

# VanishPost 渠道（服务端分配域名）
curl -X POST http://localhost:8787/api/mail/create \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{"provider": "vanishpost"}'
```

---

## 2. 获取邮件列表

**POST** `/api/mail/list`

### 请求参数

```json
{
  "address": "test123@somoj.com",
  "provider": "mailtm",  // 可选，系统可自动推断
  "accessToken": "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzUxMiJ9...",  // 可选，mailtm 需要
  "limit": 20,           // 可选，默认20
  "offset": 0,           // 可选，默认0  
  "unreadOnly": false,   // 可选，默认false
  "since": "2025-08-03T00:00:00.000Z"  // 可选，ISO日期格式
}
```

### Provider AccessToken 认证

> **⚠️ 重要**: 
> - 目前**只有 Mail.tm 渠道需要** `accessToken`，其他渠道可忽略此参数
> - `accessToken` 在创建 Mail.tm 邮箱时会自动返回
> - `accessToken` 只能在请求体中传递，不能放在 Authorization 头中

**Mail.tm 邮箱访问示例**
```json
{
  "address": "test123@somoj.com",
  "accessToken": "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzUxMiJ9...",  // 来自创建邮箱的响应
  "provider": "mailtm"
}
```

**其他提供商邮箱访问示例**
```json
{
      "address": "user123@minmail.app",
  // 无需 accessToken
  "provider": "minmail"
}
```

### 响应示例

```json
{
  "success": true,
  "data": [
    {
      "id": "msg123",
      "from": {
        "email": "sender@example.com",
        "name": "Sender Name"
      },
      "to": [
        {
          "email": "test123@somoj.com"
        }
      ],
      "subject": "Welcome Email",
      "textContent": "Welcome to our service...",  // ⚠️ 注意：这是邮件摘要，不是完整内容
      "receivedAt": "2025-08-03T07:25:00.000Z",
      "isRead": false,
      "provider": "mailtm"
    }
  ],
  "timestamp": "2025-08-03T07:30:00.000Z",
  "provider": "mailtm"
}
```

> **📝 重要说明**：
> - **邮件列表接口**返回的 `textContent` 是邮件摘要/预览
> - **要获取完整邮件内容**，请使用邮件详情接口
> - 这样设计是为了提升列表加载性能

### 测试用例

```bash
curl -X POST http://localhost:8787/api/mail/list \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "address": "your-email@domain.com",
    "limit": 10
  }'
```

---

## 3. 获取邮件详情

**POST** `/api/mail/content`

> **📧 获取完整邮件内容**：包含完整的文本和HTML内容

### 请求参数

```json
{
  "address": "test123@somoj.com",
  "id": "msg123",  // 邮件ID
  "provider": "mailtm",  // 可选
  "accessToken": "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzUxMiJ9..."  // 可选
}
```

### 响应示例

```json
{
  "success": true,
  "data": {
    "id": "msg123",
    "from": {
      "email": "sender@example.com",
      "name": "Sender Name"
    },
    "to": [
      {
        "email": "test123@somoj.com"
      }
    ],
    "subject": "Welcome Email",
    "textContent": "完整的邮件文本内容...",  // ✅ 完整内容
    "htmlContent": "<html><body>完整的HTML内容...</body></html>",  // ✅ 完整HTML
    "receivedAt": "2025-08-03T07:25:00.000Z",
    "isRead": false,
    "provider": "mailtm"
  },
  "timestamp": "2025-08-03T07:30:00.000Z",
  "provider": "mailtm"
}
```

### 测试用例

```bash
curl -X POST http://localhost:8787/api/mail/content \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "address": "your-email@domain.com",
    "id": "email-id"
  }'
```

---

## 4. 系统接口

### 健康检查

```bash
curl http://localhost:8787/health
```

### API 信息

```bash
curl http://localhost:8787/api/info
```

### 测试提供者连接

```bash
curl -X POST http://localhost:8787/api/mail/providers/test-connections
```

### 提供者统计

```bash
curl http://localhost:8787/api/mail/providers/stats
```

---

## 📊 提供商对比

| 提供商 | 域名数量 | 需要 accessToken | 域名自定义 | 说明 |
|-------|---------|----------------|-----------|------|
| **MinMail** | 1个 | ❌ | ❌ | minmail.app |
| **TempMail Plus** | 9个 | ❌ | ✅ | 最多域名选择 |
| **Mail.tm** | 1个 | ✅ | ❌ | 创建时返回，请求时必须 |
| **EtempMail** | 4个 | ❌ | ✅ | 教育域名 |
| **VanishPost** | 服务端分配 | ❌ | ❌ | 动态域名 |

> **重要提醒**: 
> - 所有提供商都需要通过 TempMailHub 的 API Key 认证（第一层认证）
> - 目前**仅 Mail.tm 需要 accessToken**（第二层认证），在创建邮箱时会返回

---

## 🚀 快速开始

### 1. 环境准备

```bash
# 克隆项目
git clone <repository-url>
cd TempMailHub

# 安装依赖
npm install

# 设置API Key（可选）
export TEMPMAILHUB_API_KEY="your_secret_key"

# 启动本地开发服务器
npm run dev
```

### 2. 基础测试

```bash
# 健康检查
curl http://localhost:8787/health

# API信息
curl http://localhost:8787/api/info

# 测试提供者连接
curl -X POST http://localhost:8787/api/mail/providers/test-connections
```

### 3. 完整流程测试

**3.1 Mail.tm 流程（需要 accessToken）**
```bash
# 1. 创建 Mail.tm 邮箱
RESPONSE=$(curl -s -X POST http://localhost:8787/api/mail/create \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{"provider": "mailtm"}')

# 提取邮箱地址和accessToken（重要！）
ADDRESS=$(echo $RESPONSE | jq -r '.data.address')
ACCESS_TOKEN=$(echo $RESPONSE | jq -r '.data.accessToken')

echo "创建的邮箱: $ADDRESS"
echo "AccessToken: $ACCESS_TOKEN"

# 2. 获取邮件列表（必须包含 accessToken）
curl -X POST http://localhost:8787/api/mail/list \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d "{
    \"address\": \"$ADDRESS\",
    \"accessToken\": \"$ACCESS_TOKEN\"
  }"
```

**3.2 其他提供商流程（无需 accessToken）**
```bash
# 1. 创建其他提供商邮箱
RESPONSE=$(curl -s -X POST http://localhost:8787/api/mail/create \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{"provider": "minmail"}')

# 只需提取邮箱地址（无 accessToken）
ADDRESS=$(echo $RESPONSE | jq -r '.data.address')

echo "创建的邮箱: $ADDRESS"

# 2. 获取邮件列表（无需 accessToken）
curl -X POST http://localhost:8787/api/mail/list \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d "{
    \"address\": \"$ADDRESS\"
  }"
```

---

## 💻 开发示例

### JavaScript/Node.js

```javascript
const API_BASE = 'http://localhost:8787';
const API_KEY = 'your_secret_api_key';

// 1. 创建邮箱
async function createEmail() {
  const response = await fetch(`${API_BASE}/api/mail/create`, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`
    },
    body: JSON.stringify({ provider: 'mailtm' })
  });
  const { data } = await response.json();
  return data;
}

// 2. 获取邮件列表
async function getEmails(address, accessToken) {
  const payload = {
    address,
    limit: 20
  };
  
  // 只有特定提供商需要accessToken（如mailtm）
  if (accessToken) {
    payload.accessToken = accessToken;
  }

  const response = await fetch(`${API_BASE}/api/mail/list`, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`  // TempMailHub API Key
    },
    body: JSON.stringify(payload)
  });
  return response.json();
}

// 3. 获取邮件详情
async function getEmailContent(address, emailId, accessToken) {
  const response = await fetch(`${API_BASE}/api/mail/content`, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`
    },
    body: JSON.stringify({
      address,
      id: emailId,
      accessToken
    })
  });
  return response.json();
}

// 使用示例
async function example() {
  // 创建邮箱（建议使用 mailtm 作为示例，因为它会返回 accessToken）
  const email = await createEmail();
  console.log('邮箱地址:', email.address);
  console.log('提供商:', email.provider);
  
  // 检查是否有 accessToken（只有 Mail.tm 会返回）
  if (email.accessToken) {
    console.log('AccessToken:', email.accessToken.substring(0, 20) + '...');
  }
  
  // 等待接收邮件...
  await new Promise(resolve => setTimeout(resolve, 5000));
  
  // 获取邮件列表（如果是 mailtm，会自动传递 accessToken）
  const emails = await getEmails(email.address, email.accessToken);
  console.log('邮件数量:', emails.data.length);
  
  if (emails.data.length > 0) {
    // 获取第一封邮件的详情
    const emailDetail = await getEmailContent(
      email.address, 
      emails.data[0].id, 
      email.accessToken  // 对于非 mailtm 提供商，这个值为 undefined，不影响使用
    );
    console.log('邮件详情:', emailDetail.data.subject);
  }
}
```

### Python

```python
import requests
import json

API_BASE = 'http://localhost:8787'
API_KEY = 'your_secret_api_key'

def create_email(provider='mailtm'):
    """创建邮箱"""
    response = requests.post(f'{API_BASE}/api/mail/create', 
        headers={
            'Content-Type': 'application/json',
            'Authorization': f'Bearer {API_KEY}'
        },
        json={'provider': provider}
    )
    return response.json()['data']

def get_emails(address, access_token=None, limit=20):
    """获取邮件列表"""
    payload = {
        'address': address,
        'limit': limit
    }
    # 只有特定提供商需要accessToken（如mailtm）
    if access_token:
        payload['accessToken'] = access_token
        
    response = requests.post(f'{API_BASE}/api/mail/list',
        headers={
            'Content-Type': 'application/json',
            'Authorization': f'Bearer {API_KEY}'  # TempMailHub API Key
        },
        json=payload
    )
    return response.json()

def get_email_content(address, email_id, access_token=None):
    """获取邮件详情"""
    payload = {
        'address': address,
        'id': email_id
    }
    if access_token:
        payload['accessToken'] = access_token
        
    response = requests.post(f'{API_BASE}/api/mail/content',
        headers={
            'Content-Type': 'application/json',
            'Authorization': f'Bearer {API_KEY}'
        },
        json=payload
    )
    return response.json()

# 使用示例
if __name__ == '__main__':
    # 创建邮箱（使用 mailtm 演示 accessToken 的使用）
    email = create_email('mailtm')
    print(f"邮箱地址: {email['address']}")
    print(f"提供商: {email['provider']}")
    
    # 检查是否有 accessToken（只有 Mail.tm 会返回）
    if 'accessToken' in email:
        print(f"AccessToken: {email['accessToken'][:20]}...")
    
    # 获取邮件列表（mailtm 需要 accessToken，其他提供商不需要）
    emails = get_emails(email['address'], email.get('accessToken'))
    print(f"邮件数量: {len(emails['data'])}")
    
    # 获取第一封邮件的详情
    if emails['data']:
        email_detail = get_email_content(
            email['address'], 
            emails['data'][0]['id'], 
            email.get('accessToken')  # 对于非 mailtm 提供商，返回 None，不影响使用
        )
        print(f"邮件主题: {email_detail['data']['subject']}")
```

---

## 🐛 故障排除

### 常见问题

1. **API Key 认证失败**
   ```bash
   # 检查环境变量
   echo $TEMPMAILHUB_API_KEY
   
   # 确保请求头格式正确
   Authorization: Bearer your_secret_api_key
   ```

2. **认证冲突问题**
   ```bash
   # ❌ 错误：将 accessToken 放在 Authorization 头中
   curl -H "Authorization: Bearer provider_access_token" ...
   
   # ✅ 正确：API Key 在头中，accessToken 在请求体中
   curl -H "Authorization: Bearer your_api_key" \
        -d '{"address": "test@example.com", "accessToken": "provider_token"}'
   ```

3. **端口被占用**
   ```bash
   # 查找占用端口的进程
   lsof -i :8787
   
   # 终止进程
   kill -9 <PID>
   ```

4. **提供者连接失败**
   ```bash
   # 测试所有提供者
   curl -X POST http://localhost:8787/api/mail/providers/test-connections
   ```

5. **邮件获取失败**
   - **Mail.tm 邮箱**: 确保使用创建邮箱时返回的 `accessToken`
   - **其他提供商**: 无需 `accessToken`，请勿添加此参数
   - 检查邮箱地址是否正确
   - 验证提供者是否正常工作


### 调试模式

```bash
# 启用详细日志
DEBUG=* npm run dev

# 查看 Wrangler 日志
npx wrangler tail
```

---

## 🚀 部署指南

### Cloudflare Workers

```bash
# 设置API Key
wrangler secret put TEMPMAILHUB_API_KEY

# 部署
wrangler deploy

# 测试生产环境
curl https://your-worker.your-subdomain.workers.dev/health
```

### Vercel

```bash
# 设置环境变量
vercel env add TEMPMAILHUB_API_KEY

# 部署
vercel --prod

# 测试
curl https://your-project.vercel.app/health
```

---

## 📄 错误处理

### 认证相关错误

**API Key 认证错误**
```json
{
  "success": false,
  "error": "API Key required. Please provide API Key via Authorization header: \"Bearer <your-api-key>\"",
  "timestamp": "2025-08-03T07:30:00.000Z"
}
```

**Mail.tm AccessToken 错误**
```json
{
  "success": false,
  "error": "No authentication token provided. Please provide accessToken parameter or ensure email was created through this service.",
  "timestamp": "2025-08-03T07:30:00.000Z",
  "provider": "mailtm"
}
```

### Provider不支持错误

```json
{
  "success": false,
  "error": "No available email provider found",
  "timestamp": "2025-08-03T07:30:00.000Z"
}
```

### 邮件未找到错误

```json
{
  "success": false,
  "error": "Email not found",
  "timestamp": "2025-08-03T07:30:00.000Z",
  "provider": "mailtm"
}
```

---

