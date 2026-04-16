# lantz-tmail 部署指南

## 概览

当前项目推荐使用 `Docker 源码部署包` 的方式发布到服务器：

1. 本地执行 `npm run pack:deploy`
2. 上传 `release/lantz-tmail-<commit>.tar.gz`
3. 服务器解压后复制 `.env.production.example` 为 `.env`
4. 执行 `docker compose up -d --build`

这种方式参考了 `play-record` 的 API 发布流程，但保持当前仓库的单应用结构，不额外引入无必要的启动脚本。

## 推荐方案：Docker 源码部署包

### 1. 本地生成部署包

```bash
npm run pack:deploy
```

执行成功后会生成：

```text
release/
├── lantz-tmail-<commit>/
└── lantz-tmail-<commit>.tar.gz
```

部署包内包含：

- `Dockerfile`
- `docker-compose.yml`
- `.dockerignore`
- `.env.production.example`
- `DEPLOY.md`
- `VERSION`
- `package.json`
- `package-lock.json`
- `tsconfig.json`
- `src/`
- `scripts/`

不会包含：

- `node_modules/`
- `dist/`
- `.git/`
- `.env`
- 本地日志、临时文件和无关文档

### 2. 上传到服务器

将 `release/lantz-tmail-<commit>.tar.gz` 上传到服务器任意目录，例如：

```bash
scp release/lantz-tmail-<commit>.tar.gz user@your-server:/srv/
```

### 3. 服务器解压并配置环境变量

```bash
cd /srv
tar -xzf lantz-tmail-<commit>.tar.gz
cd lantz-tmail-<commit>
cp .env.production.example .env
vim .env
```

推荐至少设置这些变量：

```env
PORT=8787
TEMPMAILHUB_API_KEY=replace-with-strong-api-key
IMAP_ENCRYPT_TOKEN=false
IMAP_TOKEN_TTL_HOURS=0
IMAP_TIMEOUT=120000
IMAP_STRICT_TLS=true
CHANNEL_MINMAIL_ENABLED=true
CHANNEL_TEMPMAILPLUS_ENABLED=true
CHANNEL_MAILTM_ENABLED=true
CHANNEL_ETEMPMAIL_ENABLED=true
CHANNEL_VANISHPOST_ENABLED=true
CHANNEL_TEMPMAILSAFE_ENABLED=true
CHANNEL_IMAP_ENABLED=true
```

如果你启用了：

- `IMAP_ENCRYPT_TOKEN=true`

还必须额外配置：

- `IMAP_ENCRYPTION_KEY`

### 4. 启动服务

```bash
docker compose up -d --build
```

### 5. 验证服务

```bash
docker compose ps
docker compose logs --tail=100
curl http://127.0.0.1:8787/health
curl http://127.0.0.1:8787/api/info
```

## 更新版本

更新流程保持一致：

1. 在本地重新执行 `npm run pack:deploy`
2. 上传新的 `lantz-tmail-<commit>.tar.gz`
3. 在服务器解压到新目录
4. 复制并调整 `.env`
5. 再次执行 `docker compose up -d --build`

## 直接使用仓库启动

如果你不走打包流程，也可以直接在仓库根目录启动：

```bash
cp .env.example .env
docker compose up -d --build
```

这条路径适合：

- 本机测试
- 内网服务器直接拉仓库后部署

## Node.js 传统部署

如果不使用 Docker，也可以走 Node.js 方式：

```bash
npm ci
npm run build
npm start
```

这种方式要求你自己处理：

- Node.js 运行环境
- 进程守护
- 端口与反向代理
- 环境变量注入

## 故障排查

### 1. 容器未启动

```bash
docker compose logs --tail=200
docker compose ps
```

### 2. 健康检查失败

先看服务日志，再看健康接口：

```bash
docker compose logs --tail=200
curl http://127.0.0.1:8787/health
```

### 3. API Key 未生效

确认 `.env` 中存在：

```env
TEMPMAILHUB_API_KEY=your-secret-key
```

然后重启容器：

```bash
docker compose up -d --build
```

### 4. IMAP 功能异常

优先检查：

- `CHANNEL_IMAP_ENABLED`
- `IMAP_TIMEOUT`
- `IMAP_STRICT_TLS`
- `IMAP_ENCRYPTION_KEY` 是否缺失

更多 TLS 相关问题可参考：

- [IMAP TLS 排查](./IMAP_TLS_TROUBLESHOOTING.md)
