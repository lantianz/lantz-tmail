# lantz-tmail

<div align="center">

**🌟 开源的临时邮件 API 服务 🌟**

聚合多个临时邮箱服务商，提供统一的 REST API 接口

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)
![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)
![Docker](https://img.shields.io/badge/Docker-Ready-blue.svg)

</div>

## 📖 项目简介

lantz-tmail 是一个基于 Hono 框架构建的临时邮箱 API 聚合服务，支持多个临时邮箱服务商，提供统一的 REST API 接口。

**特点**：

- 🔗 聚合多个临时邮箱服务商
- 🔐 双层认证架构（API Key + Provider AccessToken）
- 🚀 支持 Node.js、Docker、Vercel 三种部署方式
- 📦 插件化架构，易于扩展
- 🛡️ 完整的 TypeScript 类型定义

> 项目由 [TempMailHub](https://github.com/hzruo/tempmailhub) 克隆并进行简化改造

## 🚀 快速开始

### 环境要求

- Node.js >= 18.0.0
- npm 或 yarn

### 安装步骤

```bash
# 克隆项目
git clone https://github.com/lantianz/lantz-tmail.git
cd lantz-tmail

# 安装依赖
npm install
```

### 配置步骤

1. 复制环境变量配置文件：

```bash
cp .env.example .env
```

2. 编辑 `.env` 文件，设置必要的环境变量：

```bash
# 服务器配置
PORT=8787
HOST=0.0.0.0

# API 认证密钥（可选，不设置则不启用 API 认证）
TEMPMAILHUB_API_KEY=your-secret-api-key

# 渠道启用状态（可选，默认全部启用）
CHANNEL_MINMAIL_ENABLED=true
CHANNEL_TEMPMAILPLUS_ENABLED=true
CHANNEL_MAILTM_ENABLED=true
CHANNEL_ETEMPMAIL_ENABLED=true
CHANNEL_VANISHPOST_ENABLED=true
CHANNEL_TEMPMAILSAFE_ENABLED=true
CHANNEL_IMAP_ENABLED=true
```

### 启动命令

```bash
# 开发模式
npm run dev

# 生产模式
npm run build
npm start
```

服务启动后，访问 http://localhost:8787 查看主页。

## 📦 支持的服务商

| 服务商            | 域名数量   | 需要 AccessToken | 域名自定义 | 说明                         |
| ----------------- | ---------- | ---------------- | ---------- | ---------------------------- |
| **MinMail**       | 1个        | ❌               | ❌         | 自动过期                     |
| **TempMail Plus** | 9个        | ❌               | ✅         | 最多域名选择                 |
| **Mail.tm**       | 1个        | ✅               | ❌         | 创建时返回，请求时必须       |
| **EtempMail**     | 4个        | ❌               | ✅         | 教育域名                     |
| **VanishPost**    | 服务端分配 | ❌               | ❌         | 动态域名                     |
| **TempMailSafe**  | 2个        | ✅               | ✅         | tempmailsafe.com, ai-mcp.com |
| **IMAP**          | 用户自定义 | ✅               | ✅         | 连接用户自己的邮箱           |

## 🚀 部署方式

### Node.js 部署

```bash
# 构建项目
npm run build

# 设置环境变量
export TEMPMAILHUB_API_KEY="your-secret-key"
export NODE_ENV="production"

# 启动服务
npm start
```

### Docker 部署

```bash
# 使用 docker-compose（推荐）
docker-compose up -d

# 或使用 docker run
docker build -t lantz-tmail .
docker run -d \
  -p 8787:8787 \
  -e TEMPMAILHUB_API_KEY="your-secret-key" \
  --name lantz-tmail \
  lantz-tmail
```

### Vercel 部署

1. Fork 本项目到你的 GitHub 账号
2. 在 Vercel 中导入项目
3. 设置环境变量 `TEMPMAILHUB_API_KEY`
4. 部署

或使用 Vercel CLI：

```bash
# 安装 Vercel CLI
npm i -g vercel

# 设置环境变量
vercel env add TEMPMAILHUB_API_KEY

# 部署
vercel --prod
```

## 📚 文档

- [API 文档](docs/API_DOCUMENTATION.md) - 完整的 API 接口说明和使用示例
- [安全配置](docs/API_SECURITY.md) - API Key 认证配置指南
- [部署指南](docs/DEPLOYMENT.md) - 详细的部署说明

## 🔧 基本使用

### 创建邮箱

```bash
curl -X POST http://localhost:8787/api/mail/create \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{"provider": "minmail"}'
```

### 获取邮件列表

```bash
curl -X POST http://localhost:8787/api/mail/list \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "address": "user@minmail.app"
  }'
```

### 获取邮件详情

```bash
curl -X POST http://localhost:8787/api/mail/content \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "address": "user@minmail.app",
    "id": "email-id"
  }'
```

更多使用示例请查看 [API 文档](docs/API_DOCUMENTATION.md)。

## 🏗️ 项目结构

```
lantz-tmail/
├── src/
│   ├── config/            # 配置管理
│   ├── providers/         # 邮件服务商适配器
│   ├── services/          # 业务逻辑层
│   ├── middleware/        # 认证中间件
│   ├── types/             # TypeScript 类型定义
│   ├── views/             # HTML 视图文件
│   ├── index.ts           # 应用入口
│   └── server.ts          # 服务器启动文件
├── docs/                  # 文档目录
├── api/                   # Vercel 部署入口
├── Dockerfile             # Docker 配置
├── docker-compose.yml     # Docker Compose 配置
└── README.md              # 项目说明
```

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📄 许可证

本项目基于 [MIT 许可证](LICENSE) 开源。

## 🙏 致谢

- [Hono](https://hono.dev/) - 轻量级 Web 框架
- [TempMailHub](https://github.com/hzruo/tempmailhub) - 原始项目
- 所有临时邮箱服务提供商

---

<div align="center">

**如果这个项目对您有帮助，请给我们一个 ⭐**

Made with ❤️ by lantianz

</div>
