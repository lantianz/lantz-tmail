# TempMailHub 部署指南

## 🌍 多平台部署支持

TempMailHub 支持多种部署平台，每个平台都有不同的环境变量设置方法。

## 🔐 API Key 设置方法

### 1. Cloudflare Workers

```bash
# 设置密钥
npx wrangler secret put TEMPMAILHUB_API_KEY

# 部署
npm run deploy:cloudflare
```

**特点**：
- ✅ 密钥加密存储
- ✅ 立即生效，无需重启
- ✅ 通过 `env` 参数访问

### 2. Vercel

```bash
# 方法1: 通过CLI设置
vercel env add TEMPMAILHUB_API_KEY

# 方法2: 通过Dashboard设置
# 1. 进入项目设置 > Environment Variables
# 2. 添加 TEMPMAILHUB_API_KEY
# 3. 选择环境: Production, Preview, Development

# 部署
npm run deploy:vercel
```

**特点**：
- ✅ 支持不同环境 (Production/Preview/Development)
- ✅ 最大 64KB 变量大小
- ✅ 通过 `process.env` 访问

### 3. Deno Deploy

```bash
# 方法1: 通过Dashboard设置
# 1. 进入项目 Settings > Environment Variables  
# 2. 添加 TEMPMAILHUB_API_KEY

# 方法2: 通过CLI部署时设置
npm run deploy:deno
```

**特点**：
- ✅ Dashboard 图形界面设置
- ✅ 支持生产和预览环境
- ✅ 通过 `Deno.env.get()` 访问
- ⚠️ 需要 `--allow-env` 权限

### 4. Netlify

```bash
# 方法1: 通过Dashboard设置
# 1. 进入 Site settings > Environment variables
# 2. 添加 TEMPMAILHUB_API_KEY

# 方法2: 通过netlify.toml设置
# [build.environment]
# TEMPMAILHUB_API_KEY = "your-key"

# 部署
npm run deploy:netlify
```

**特点**：
- ✅ 构建时和运行时环境变量
- ✅ 支持分支特定变量
- ✅ 通过 `process.env` 访问

### 5. Docker

```bash
# 方法1: 通过环境变量运行
docker run -d -p 8787:8787 \
  -e TEMPMAILHUB_API_KEY="your-secret-key" \
  --name tempmailhub \
  ghcr.io/hzruo/tempmailhub:latest

# 方法2: 通过docker-compose.yml
# environment:
#   - TEMPMAILHUB_API_KEY=your-secret-key

docker-compose up -d
```

### 6. 本地开发

```bash
# 方法1: 环境变量
export TEMPMAILHUB_API_KEY="your-secret-key"
npm start

# 方法2: .env 文件
echo "TEMPMAILHUB_API_KEY=your-secret-key" > .env
npm start

# 方法3: Vercel本地开发
vercel env pull  # 自动拉取线上环境变量
vercel dev
```

## 📊 平台对比

| 平台 | 设置方式 | 访问方式 | 特性 |
|------|---------|----------|------|
| **Cloudflare Workers** | `wrangler secret put` | `env.VARIABLE` | 加密存储，立即生效 |
| **Vercel** | Dashboard/CLI | `process.env.VARIABLE` | 多环境支持，64KB限制 |
| **Deno Deploy** | Dashboard | `Deno.env.get()` | 图形界面，权限控制 |
| **Netlify** | Dashboard/配置文件 | `process.env.VARIABLE` | 分支特定变量 |
| **Docker** | 运行时参数 | `process.env.VARIABLE` | 容器级别隔离 |

## 🛠️ 平台特定配置

### Cloudflare Workers

```toml
# wrangler.toml
name = "tempmailhub"
main = "src/index.ts"
compatibility_date = "2024-01-01"

# 密钥通过 wrangler secret put 设置，不在配置文件中
```

### Vercel

```json
{
  "version": 2,
  "framework": null,
  "routes": [
    { "src": "/(.*)", "dest": "/src/index.ts" }
  ],
  "buildCommand": "npm run build",
  "outputDirectory": "dist"
}
```

### Deno Deploy

```json
{
  "tasks": {
    "start": "deno run --allow-net --allow-env --allow-read src/index.ts"
  },
  "imports": {
    "hono": "https://deno.land/x/hono@v3.11.11/mod.ts"
  }
}
```

### Netlify

```toml
[build]
  command = "npm run build"
  publish = "dist"
  functions = "netlify/functions"

[[redirects]]
  from = "/*"
  to = "/.netlify/functions/server"
  status = 200
```

## 🔍 故障排除

### 1. 环境变量未生效

**检查步骤**：
1. 访问 `/api/info` 端点查看认证状态
2. 检查日志中的平台检测信息
3. 确认变量名拼写正确：`TEMPMAILHUB_API_KEY`

### 2. 平台特定问题

**Cloudflare Workers**：
```bash
# 确认密钥已设置
wrangler secret list

# 重新部署
wrangler deploy
```

**Vercel**：
```bash
# 拉取环境变量
vercel env pull

# 检查环境变量
vercel env ls
```

**Deno**：
```bash
# 确认权限
deno run --allow-env src/index.ts
```

**Netlify**：
```bash
# 检查构建日志
netlify build
```

## 📝 最佳实践

1. **不要在代码中硬编码API Key**
2. **使用平台推荐的密钥管理方式**
3. **为不同环境设置不同的API Key**
4. **定期轮换API Key**
5. **监控API Key使用情况**

## 🔗 相关链接

- [Cloudflare Workers Secrets](https://developers.cloudflare.com/workers/configuration/secrets/)
- [Vercel Environment Variables](https://vercel.com/docs/environment-variables)
- [Deno Environment Variables](https://docs.deno.org.cn/runtime/reference/env_variables/)
- [Netlify Environment Variables](https://docs.netlify.com/build/environment-variables/get-started/) 