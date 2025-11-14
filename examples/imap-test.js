/**
 * IMAP Provider 测试示例
 * 
 * 使用方法：
 * 1. 复制此文件并重命名为 imap-test-local.js
 * 2. 填入你的真实 IMAP 配置
 * 3. 运行：node examples/imap-test-local.js
 */

const API_BASE_URL = 'http://localhost:8080/api';
const API_KEY = 'your-api-key-here'; // 如果设置了 API_KEY

// IMAP 配置示例（请替换为你的真实配置）
const IMAP_CONFIG = {
  provider: 'imap',
  imap: {
    domain: 'example.com',           // 你的域名
    imap_server: 'imap.gmail.com',   // IMAP 服务器
    imap_port: 993,                  // IMAP 端口
    imap_user: 'your-email@gmail.com', // 邮箱地址
    imap_pass: 'your-app-password',  // 应用专用密码/授权码
    imap_dir: 'INBOX'                // 邮件目录（可选）
  }
};

/**
 * 测试创建邮箱（连接 IMAP）
 */
async function testCreateEmail() {
  console.log('\n=== 测试 1: 创建邮箱（连接 IMAP） ===');
  
  try {
    const response = await fetch(`${API_BASE_URL}/mail/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // 'Authorization': `Bearer ${API_KEY}` // 如果需要
      },
      body: JSON.stringify(IMAP_CONFIG)
    });
    
    const result = await response.json();
    
    if (result.success) {
      console.log('✅ 连接成功！');
      console.log('邮箱地址:', result.data.address);
      console.log('accessToken:', result.data.accessToken.substring(0, 50) + '...');
      return result.data.accessToken;
    } else {
      console.error('❌ 连接失败:', result.error);
      if (result.metadata?.details) {
        console.error('详细信息:', result.metadata.details);
      }
      return null;
    }
  } catch (error) {
    console.error('❌ 请求失败:', error.message);
    return null;
  }
}

/**
 * 测试获取邮件列表
 */
async function testGetEmails(accessToken) {
  console.log('\n=== 测试 2: 获取邮件列表 ===');
  
  try {
    const response = await fetch(`${API_BASE_URL}/mail/list`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        address: IMAP_CONFIG.imap.imap_user,
        provider: 'imap',
        accessToken
      })
    });
    
    const result = await response.json();
    
    if (result.success) {
      console.log(`✅ 获取成功！共 ${result.data.length} 封邮件`);
      
      result.data.forEach((email, index) => {
        console.log(`\n邮件 ${index + 1}:`);
        console.log('  ID:', email.id);
        console.log('  发件人:', email.from.name || email.from.email);
        console.log('  主题:', email.subject);
        console.log('  时间:', new Date(email.receivedAt).toLocaleString('zh-CN'));
        console.log('  已读:', email.isRead ? '是' : '否');
      });
      
      return result.data.length > 0 ? result.data[0].id : null;
    } else {
      console.error('❌ 获取失败:', result.error);
      return null;
    }
  } catch (error) {
    console.error('❌ 请求失败:', error.message);
    return null;
  }
}

/**
 * 测试获取邮件详情
 */
async function testGetEmailContent(accessToken, emailId) {
  console.log('\n=== 测试 3: 获取邮件详情 ===');
  
  if (!emailId) {
    console.log('⚠️  没有可用的邮件 ID，跳过此测试');
    return;
  }
  
  try {
    const response = await fetch(`${API_BASE_URL}/mail/content`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        address: IMAP_CONFIG.imap.imap_user,
        emailId,
        provider: 'imap',
        accessToken
      })
    });
    
    const result = await response.json();
    
    if (result.success) {
      console.log('✅ 获取成功！');
      console.log('主题:', result.data.subject);
      console.log('发件人:', result.data.from.name || result.data.from.email);
      console.log('收件人:', result.data.to.map(t => t.email).join(', '));
      console.log('文本内容:', result.data.textContent ? 
        result.data.textContent.substring(0, 100) + '...' : '(无)');
      console.log('HTML 内容:', result.data.htmlContent ? 
        result.data.htmlContent.substring(0, 100) + '...' : '(无)');
    } else {
      console.error('❌ 获取失败:', result.error);
    }
  } catch (error) {
    console.error('❌ 请求失败:', error.message);
  }
}

/**
 * 运行所有测试
 */
async function runTests() {
  console.log('🚀 开始测试 IMAP Provider...');
  console.log('API 地址:', API_BASE_URL);
  console.log('IMAP 服务器:', IMAP_CONFIG.imap.imap_server);
  console.log('邮箱地址:', IMAP_CONFIG.imap.imap_user);
  
  // 测试 1: 创建邮箱
  const accessToken = await testCreateEmail();
  if (!accessToken) {
    console.log('\n❌ 测试终止：无法连接到 IMAP 服务器');
    return;
  }
  
  // 等待 2 秒
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // 测试 2: 获取邮件列表
  const emailId = await testGetEmails(accessToken);
  
  // 等待 2 秒
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // 测试 3: 获取邮件详情
  await testGetEmailContent(accessToken, emailId);
  
  console.log('\n✅ 所有测试完成！');
}

// 运行测试
runTests().catch(error => {
  console.error('❌ 测试失败:', error);
  process.exit(1);
});

