# Vercel 部署错误修复总结

## 问题描述

在 Vercel 平台部署时遇到错误：
```
npm error Exit handler never called!
npm error This is an error with npm itself.
Error: Command "npm install" exited with 1
```

## 根本原因

`imapflow` 包是一个需要原生编译的 Node.js 模块，在 Vercel 的构建环境中可能导致安装失败。该包依赖于底层的 TCP socket 连接，而这在 Vercel 的无服务器环境中本身就不受支持。

## 解决方案

### 1. 修改 `package.json`

**变更内容**：
- 将 `imapflow` 从 `dependencies` 移至 `optionalDependencies`
- 添加 `engines` 字段指定 Node.js 版本
- 添加 `build:vercel` 脚本

```json
{
  "engines": {
    "node": ">=18.0.0"
  },
  "dependencies": {
    "@hono/node-server": "^1.12.0",
    "hono": "^4.6.3"
  },
  "optionalDependencies": {
    "imapflow": "^1.1.1"
  }
}
```

**效果**：即使 `imapflow` 安装失败，也不会阻止整个构建过程。

### 2. 更新 `vercel.json`

**变更内容**：
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

**效果**：
- 使用多个回退选项确保依赖安装成功
- 正确配置路由到 Vercel Serverless Function

### 3. 创建 Vercel 入口文件

**新文件**: `api/index.ts`
```typescript
import { handle } from '@hono/node-server/vercel';
import app from '../src/index.js';

export default handle(app);
```

**效果**：提供 Vercel Serverless Function 的正确入口点。

### 4. 添加错误处理

**修改文件**: `src/providers/imap.ts`

在 `connectImap` 方法中添加了对 `imapflow` 模块缺失的处理：
```typescript
try {
  const { ImapFlow } = await import('imapflow');
  // ... 连接逻辑
} catch (error: any) {
  if (error.code === 'MODULE_NOT_FOUND' || error.message?.includes('Cannot find module')) {
    throw new Error('IMAP 功能不可用：imapflow 模块未安装。IMAP Provider 仅在 Node.js 环境中可用。');
  }
  throw error;
}
```

**效果**：当 IMAP provider 被调用但 `imapflow` 不可用时，提供清晰的错误信息。

### 5. 创建 `.npmrc` 配置

**新文件**: `.npmrc`
```
legacy-peer-deps=true
strict-ssl=true
engine-strict=false
optional=true
```

**效果**：配置 npm 以更宽松的方式处理依赖安装。

### 6. 创建 `.vercelignore`

**新文件**: `.vercelignore`
```
*.md
.git
tests/
coverage/
.vscode/
*.log
```

**效果**：减少上传到 Vercel 的文件大小，加快部署速度。

## 验证步骤

### 本地验证
```bash
# 1. 清理并重新安装依赖
rm -rf node_modules package-lock.json
npm install

# 2. 构建项目
npm run build

# 3. 本地运行
npm run dev:node
```

### Vercel 部署验证
```bash
# 使用 Vercel CLI 本地测试
vercel dev

# 部署到 Vercel
vercel --prod
```

## 功能影响

### ✅ 可用功能
- MinMail Provider
- TempMail Plus Provider
- Mail.tm Provider
- EtempMail Provider
- VanishPost Provider
- TempMailSafe Provider
- 所有基于 HTTP API 的功能

### ❌ 不可用功能
- IMAP Provider（仅在 Vercel 上不可用）
  - 原因：需要持久的 TCP 连接
  - 替代方案：在支持长连接的平台部署（如 VPS、Docker）

## 后续建议

1. **多平台部署**：
   - Vercel：用于 HTTP API providers
   - VPS/Docker：用于需要 IMAP 功能的场景

2. **监控**：
   - 在 Vercel Dashboard 中监控函数执行情况
   - 设置错误告警

3. **文档**：
   - 在 API 文档中说明 IMAP 在 Vercel 上的限制
   - 提供替代部署方案

## 相关文件

- `package.json` - 依赖配置
- `vercel.json` - Vercel 部署配置
- `api/index.ts` - Vercel 入口文件
- `.npmrc` - npm 配置
- `.vercelignore` - Vercel 忽略文件
- `VERCEL_DEPLOYMENT.md` - 详细部署指南
- `src/providers/imap.ts` - IMAP provider 错误处理

## 测试结果

✅ 本地构建成功
✅ npm install 成功（imapflow 作为可选依赖）
✅ TypeScript 编译无错误
✅ 所有非 IMAP providers 正常工作

## 总结

通过将 `imapflow` 设置为可选依赖，并配置多个安装回退选项，成功解决了 Vercel 部署时的 npm 安装错误。虽然 IMAP 功能在 Vercel 上不可用，但这是平台限制，不影响其他所有基于 HTTP API 的 provider 正常工作。

