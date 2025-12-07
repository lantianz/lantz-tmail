/**
 * IMAP 连接测试脚本
 * 用于测试 TLS 连接问题的修复
 */

import { ImapProvider } from './dist/providers/imap.js'

// 测试配置（请替换为实际的 IMAP 配置）
const testConfig = {
  enabled: true,
  priority: 1,
  timeout: 30000,
  retries: 2,
}

const imapConfig = {
  domain: 'example.com',
  imap_server: 'imap.gmail.com', // 或其他 IMAP 服务器
  imap_port: 993,
  imap_user: 'your-email@gmail.com', // 请替换为实际邮箱
  imap_pass: 'your-app-password', // 请替换为实际应用密码
  imap_dir: 'INBOX'
}

async function testImapConnection() {
  console.log('🧪 开始测试 IMAP 连接...')
  
  try {
    const provider = new ImapProvider(testConfig)
    await provider.initialize(testConfig)
    
    console.log('✅ IMAP Provider 初始化成功')
    
    // 测试创建邮箱（实际是测试连接）
    const result = await provider.createEmail({
      provider: 'imap',
      imap: imapConfig
    })
    
    if (result.success) {
      console.log('✅ IMAP 连接测试成功！')
      console.log('📧 生成的邮箱地址:', result.data.address)
      console.log('🔑 AccessToken 长度:', result.data.accessToken.length)
    } else {
      console.error('❌ IMAP 连接测试失败:', result.error?.message)
    }
    
  } catch (error) {
    console.error('❌ 测试过程中发生错误:', error.message)
    
    // 分析错误类型
    if (error.message.includes('socket disconnected')) {
      console.log('💡 这是 TLS 连接问题，修复应该能解决此问题')
    } else if (error.message.includes('AUTHENTICATIONFAILED')) {
      console.log('💡 这是认证问题，请检查邮箱地址和应用密码')
    } else if (error.message.includes('ECONNREFUSED')) {
      console.log('💡 这是网络连接问题，请检查服务器地址和端口')
    }
  }
}

// 运行测试
if (process.argv.length < 4) {
  console.log('使用方法: node test-imap-connection.js <email> <app-password> [server] [port]')
  console.log('示例: node test-imap-connection.js user@gmail.com your-app-password imap.gmail.com 993')
  process.exit(1)
}

// 从命令行参数获取配置
imapConfig.imap_user = process.argv[2]
imapConfig.imap_pass = process.argv[3]
if (process.argv[4]) imapConfig.imap_server = process.argv[4]
if (process.argv[5]) imapConfig.imap_port = parseInt(process.argv[5])

// 从邮箱地址提取域名
const emailParts = imapConfig.imap_user.split('@')
if (emailParts.length === 2) {
  imapConfig.domain = emailParts[1]
}

testImapConnection()
