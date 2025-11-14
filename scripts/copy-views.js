/**
 * 构建后处理脚本：复制视图文件到 dist 目录
 *
 * TypeScript 编译器只编译 .ts 文件，不会复制其他资源文件
 * 这个脚本确保 HTML 等静态资源文件被复制到输出目录
 */

import { copyFileSync, mkdirSync, existsSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const projectRoot = join(__dirname, '..')

// 需要复制的文件列表
const filesToCopy = [
  {
    src: 'src/views/home.html',
    dest: 'dist/views/home.html',
  },
]

console.log('📦 开始复制视图文件...')

filesToCopy.forEach(({ src, dest }) => {
  const srcPath = join(projectRoot, src)
  const destPath = join(projectRoot, dest)

  // 确保目标目录存在
  const destDir = dirname(destPath)
  if (!existsSync(destDir)) {
    mkdirSync(destDir, { recursive: true })
    console.log(`  ✅ 创建目录: ${destDir}`)
  }

  // 复制文件
  try {
    copyFileSync(srcPath, destPath)
    console.log(`  ✅ 复制文件: ${src} -> ${dest}`)
  } catch (error) {
    console.error(`  ❌ 复制失败: ${src}`)
    console.error(`     错误: ${error.message}`)
    process.exit(1)
  }
})

console.log('✅ 视图文件复制完成！')
