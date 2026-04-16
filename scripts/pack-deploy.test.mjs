import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildArchiveName,
  renderDeployEnvExample,
  renderDeployReadme,
  shouldCopyPath,
} from './pack-deploy.mjs'

test('buildArchiveName uses repository name without src suffix', () => {
  assert.equal(buildArchiveName('abc1234'), 'lantz-tmail-abc1234.tar.gz')
})

test('renderDeployReadme uses compose deployment flow', () => {
  const readme = renderDeployReadme('abc1234')

  assert.match(readme, /docker compose up -d --build/)
  assert.match(readme, /lantz-tmail-abc1234\.tar\.gz/)
})

test('renderDeployEnvExample exposes production defaults', () => {
  const envExample = renderDeployEnvExample()

  assert.match(envExample, /PORT=8787/)
  assert.match(envExample, /TEMPMAILHUB_API_KEY=/)
})

test('shouldCopyPath excludes build artifacts and env files', () => {
  assert.equal(shouldCopyPath('dist/server.js'), false)
  assert.equal(shouldCopyPath('node_modules/hono/index.js'), false)
  assert.equal(shouldCopyPath('.env'), false)
  assert.equal(shouldCopyPath('src/server.ts'), true)
})
