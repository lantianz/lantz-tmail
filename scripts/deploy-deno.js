#!/usr/bin/env node

/**
 * Deno Deploy 部署脚本
 * 使用方法: npm run deploy:deno
 */

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

async function deployToDeno() {
  try {
    console.log('🦕 准备部署到 Deno Deploy...');
    
    // 检查是否安装了 Deno CLI
    try {
      await execAsync('deno --version');
    } catch (error) {
      console.error('❌ 未找到 Deno CLI。请先安装: https://deno.land/#installation');
      process.exit(1);
    }
    
    // 检查是否登录 Deno Deploy
    try {
      console.log('🔑 检查 Deno Deploy 登录状态...');
      await execAsync('deno deploy status');
    } catch (error) {
      console.log('🔑 请登录 Deno Deploy...');
      await execAsync('deno deploy login');
    }
    
    // 部署项目
    console.log('🚀 部署到 Deno Deploy...');
    const projectName = process.env.DENO_PROJECT || 'tempmailhub';
    
    const { stdout, stderr } = await execAsync(
      `deno deploy --project=${projectName} --include=src,deno.json --unstable-sloppy-imports src/index.ts`
    );
    
    if (stderr) {
      console.error('⚠️ 部署警告:', stderr);
    }
    
    console.log('✅ 部署成功!');
    console.log(stdout);
    console.log(`🌐 应用已部署到: https://${projectName}.deno.dev`);
  } catch (error) {
    console.error('❌ 部署失败:', error.message);
    process.exit(1);
  }
}

deployToDeno(); 