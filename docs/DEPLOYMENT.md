# TempMailHub 部署指南

## 🌍 Node.js 部署支持

TempMailHub 基于 Node.js 运行时，支持 Docker 容器化部署和传统 Node.js 部署。

## 🔐 API Key 设置方法

### 1. 本地开发

```bash
# 方法1: .env 文件（推荐）
echo "TEMPMAILHUB_API_KEY=your-secret-key" > .env
npm run dev

# 方法2: 环境变量
export TEMPMAILHUB_API_KEY="your-secret-key"
npm run dev
```

**特点**：

- ✅ 简单易用
- ✅ 支持 `.env` 文件
- ✅ 通过 `process.env` 访问

### 2. Docker 部署

```bash
# 方法1: 通过 docker run 参数
docker run -e TEMPMAILHUB_API_KEY="your-secret-key" -p 8787:8787 tempmailhub

# 方法2: 通过 docker-compose.yml
# environment:
#   - TEMPMAILHUB_API_KEY=your-secret-key

docker-compose up -d
```

**特点**：

- ✅ 容器级别隔离
- ✅ 易于扩展
- ✅ 生产环境推荐

### 3. 生产环境部署

```bash
# 构建项目
npm run build

# 设置环境变量
export TEMPMAILHUB_API_KEY="your-secret-key"
export NODE_ENV="production"
export PORT="8787"

# 启动服务
npm start
```

**特点**：

- ✅ 高性能
- ✅ 稳定可靠
- ✅ 支持进程管理器（PM2、systemd 等）

## 📊 部署方式对比

| 部署方式     | 设置方式           | 访问方式               | 适用场景   |
| ------------ | ------------------ | ---------------------- | ---------- |
| **本地开发** | `.env` 文件        | `process.env.VARIABLE` | 开发测试   |
| **Docker**   | 运行时参数/compose | `process.env.VARIABLE` | 容器化部署 |
| **生产环境** | 环境变量           | `process.env.VARIABLE` | 传统部署   |

## 🛠️ 部署配置

### Docker 配置

```yaml
# docker-compose.yml
version: '3.8'

services:
  tempmailhub:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: tempmailhub
    restart: unless-stopped
    ports:
      - '8787:8787'
    environment:
      - NODE_ENV=production
      - TEMPMAILHUB_API_KEY=your-secret-api-key
    healthcheck:
      test: ['CMD', 'wget', '--spider', '-q', 'http://localhost:8787/health']
      interval: 30s
      timeout: 10s
      retries: 3
```

### PM2 配置

```json
{
  "apps": [
    {
      "name": "tempmailhub",
      "script": "dist/server.js",
      "instances": "max",
      "exec_mode": "cluster",
      "env": {
        "NODE_ENV": "production",
        "PORT": "8787"
      },
      "env_production": {
        "NODE_ENV": "production",
        "TEMPMAILHUB_API_KEY": "your-secret-key"
      }
    }
  ]
}
```

### Systemd 配置

```ini
[Unit]
Description=TempMailHub Service
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/tempmailhub
Environment="NODE_ENV=production"
Environment="TEMPMAILHUB_API_KEY=your-secret-key"
Environment="PORT=8787"
ExecStart=/usr/bin/node dist/server.js
Restart=always

[Install]
WantedBy=multi-user.target
```

## 🔍 故障排除

### 1. 环境变量未生效

**检查步骤**：

1. 访问 `/api/info` 端点查看认证状态
2. 检查日志中的环境信息
3. 确认变量名拼写正确：`TEMPMAILHUB_API_KEY`
4. 确认 `.env` 文件位于项目根目录

### 2. 端口占用问题

```bash
# 检查端口占用
lsof -i :8787

# 修改端口
export PORT=8080
npm start
```

### 3. Docker 部署问题

```bash
# 查看容器日志
docker logs tempmailhub

# 重启容器
docker restart tempmailhub

# 重新构建
docker-compose up -d --build
```

## 📝 最佳实践

1. **不要在代码中硬编码 API Key**
2. **使用 `.env` 文件管理本地开发环境变量**
3. **生产环境使用系统环境变量或密钥管理服务**
4. **定期轮换 API Key**
5. **监控 API Key 使用情况**
6. **使用 HTTPS 保护 API 通信**

## 🔗 相关链接

- [Node.js 环境变量最佳实践](https://nodejs.org/en/learn/command-line/how-to-read-environment-variables-from-nodejs)
- [Docker 环境变量](https://docs.docker.com/compose/environment-variables/)
- [PM2 进程管理](https://pm2.keymetrics.io/docs/usage/quick-start/)
