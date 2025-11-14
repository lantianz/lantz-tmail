# Vercel 部署指南

## 重要说明

### IMAP Provider 限制

由于 Vercel 的无服务器环境限制，`imapflow` 包已被移至 `optionalDependencies`。这意味着：

1. **IMAP Provider 在 Vercel 上不可用** - IMAP 功能需要持久的 TCP 连接，这在 Vercel 的无服务器环境中不受支持
2. **其他 Provider 正常工作** - MinMail、TempMail Plus、Mail.tm、EtempMail、VanishPost、TempMailSafe 等基于 HTTP API 的 provider 完全可用
3. **构建不会失败** - 即使 `imapflow` 安装失败，应用仍然可以正常构建和运行

### 部署步骤

1. **连接 GitHub 仓库到 Vercel**
   - 访问 [Vercel Dashboard](https://vercel.com/dashboard)
   - 点击 "New Project"
   - 导入你的 GitHub 仓库

2. **配置环境变量（可选）**
   ```
   API_KEY=your-secret-api-key
   NODE_ENV=production
   ```

3. **部署设置**
   - Framework Preset: 选择 "Other"
   - Build Command: `npm run build:vercel`
   - Output Directory: 留空
   - Install Command: 自动检测（使用 vercel.json 中的配置）

4. **点击 Deploy**

### 配置文件说明

#### `vercel.json`
```json
{
  "version": 2,
  "installCommand": "npm install --legacy-peer-deps || npm install --force || npm install",
  "buildCommand": "npm run build:vercel",
  "rewrites": [
    {
      "source": "/(.*)",
      "destination": "/api/index"
    }
  ]
}
```

- `installCommand`: 使用多个回退选项确保依赖安装成功
- `rewrites`: 将所有请求路由到 `/api/index` 入口点

#### `api/index.ts`
Vercel Serverless Function 的入口点，使用 `@hono/node-server/vercel` 适配器。

### 故障排除

#### 问题：npm install 失败
**解决方案**：
- 确保 `imapflow` 在 `optionalDependencies` 中
- Vercel 会尝试多种安装方式（`--legacy-peer-deps`、`--force`、默认）

#### 问题：构建超时
**解决方案**：
- 检查 TypeScript 编译是否有错误
- 确保 `build:vercel` 脚本简单快速

#### 问题：运行时错误
**解决方案**：
- 检查 Vercel 函数日志
- 确保没有使用 Node.js 特定的 API（如 `fs`、`child_process` 等）
- 确保所有异步初始化都在请求处理中完成

### 性能优化

1. **冷启动优化**
   - 避免在模块顶层进行耗时操作
   - 使用懒加载导入大型依赖

2. **函数大小优化**
   - 移除未使用的依赖
   - 使用 `.vercelignore` 排除不必要的文件

### 监控和日志

- 访问 Vercel Dashboard 查看实时日志
- 使用 Vercel Analytics 监控性能
- 设置告警通知

### 限制

- **执行时间**: 免费版 10 秒，Pro 版 60 秒
- **内存**: 1024 MB
- **包大小**: 50 MB（压缩后）
- **不支持**: WebSocket、长连接、IMAP 等需要持久连接的协议

### 推荐的 Provider

在 Vercel 上推荐使用以下 Provider：
- ✅ MinMail
- ✅ TempMail Plus
- ✅ Mail.tm
- ✅ EtempMail
- ✅ VanishPost
- ✅ TempMailSafe
- ❌ IMAP（不支持）

### 本地测试

```bash
# 安装依赖
npm install

# 本地开发
npm run dev:node

# 构建测试
npm run build

# 使用 Vercel CLI 本地测试
vercel dev
```

### 相关链接

- [Vercel 文档](https://vercel.com/docs)
- [Hono 文档](https://hono.dev/)
- [项目 GitHub](https://github.com/hzruo/tempmailhub)

