import { cp, mkdir, rm, writeFile } from 'node:fs/promises'
import { execFileSync, spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptFilePath = fileURLToPath(import.meta.url)
const repoRoot = path.resolve(path.dirname(scriptFilePath), '..')

export const DEPLOY_INCLUDE_PATHS = [
  'Dockerfile',
  'docker-compose.yml',
  '.dockerignore',
  'package.json',
  'package-lock.json',
  'tsconfig.json',
  'src',
  'scripts',
]

const EXCLUDED_PATH_SEGMENTS = new Set([
  '.git',
  '.wrangler',
  'coverage',
  'dist',
  'node_modules',
])
const EXCLUDED_FILE_NAMES = new Set([
  '.env',
  '.env.development',
  '.env.local',
  '.env.test',
])
const EXCLUDED_FILE_EXTENSIONS = new Set(['.bak', '.log', '.tmp'])

export function shouldCopyPath(srcPath) {
  const normalized = path.normalize(srcPath)
  const segments = normalized.split(path.sep)

  if (segments.some((segment) => EXCLUDED_PATH_SEGMENTS.has(segment))) {
    return false
  }

  const baseName = path.basename(srcPath)

  if (EXCLUDED_FILE_NAMES.has(baseName)) {
    return false
  }

  if (baseName.includes('.test.')) {
    return false
  }

  const extension = path.extname(baseName).toLowerCase()
  return !EXCLUDED_FILE_EXTENSIONS.has(extension)
}

export function buildArchiveName(commit) {
  return `lantz-tmail-${commit}.tar.gz`
}

export function buildReleaseName(commit) {
  return `lantz-tmail-${commit}`
}

export function renderDeployEnvExample() {
  return [
    '# lantz-tmail production environment template',
    'PORT=8787',
    'TEMPMAILHUB_API_KEY=replace-with-strong-api-key',
    '',
    '# IMAP settings',
    'IMAP_ENCRYPT_TOKEN=false',
    'IMAP_TOKEN_TTL_HOURS=0',
    'IMAP_TIMEOUT=120000',
    'IMAP_STRICT_TLS=true',
    '# IMAP_ENCRYPTION_KEY=replace-with-32-char-hex-key',
    '',
    '# Channel flags',
    'CHANNEL_MINMAIL_ENABLED=true',
    'CHANNEL_TEMPMAILPLUS_ENABLED=true',
    'CHANNEL_MAILTM_ENABLED=true',
    'CHANNEL_ETEMPMAIL_ENABLED=true',
    'CHANNEL_VANISHPOST_ENABLED=true',
    'CHANNEL_TEMPMAILSAFE_ENABLED=true',
    'CHANNEL_IMAP_ENABLED=true',
    '',
  ].join('\n')
}

export function renderDeployReadme(commit) {
  const releaseName = buildReleaseName(commit)

  return [
    '# lantz-tmail Docker deploy',
    '',
    '## Package',
    `${releaseName}.tar.gz`,
    '',
    '## Server steps',
    '```bash',
    `tar -xzf ${releaseName}.tar.gz`,
    `cd ${releaseName}`,
    'cp .env.production.example .env',
    'vim .env',
    'docker compose up -d --build',
    '```',
    '',
    '## Verify',
    '```bash',
    'docker compose ps',
    'docker compose logs --tail=100',
    'curl http://127.0.0.1:8787/health',
    '```',
    '',
    `Commit: ${commit}`,
    '',
  ].join('\n')
}

export function renderVersionFile(commit) {
  return `commit=${commit}\n`
}

export async function copyIncludedPathsToStaging({
  includePaths = DEPLOY_INCLUDE_PATHS,
  root = repoRoot,
  stagingDir,
}) {
  for (const relativePath of includePaths) {
    const srcPath = path.join(root, relativePath)
    const destPath = path.join(stagingDir, relativePath)

    await mkdir(path.dirname(destPath), { recursive: true })
    await cp(srcPath, destPath, {
      recursive: true,
      force: true,
      filter: shouldCopyPath,
    })
  }
}

export function runTarArchive({ archiveName, stagingName, releaseDir }) {
  const result = spawnSync('tar', ['-czf', archiveName, stagingName], {
    cwd: releaseDir,
    stdio: 'inherit',
  })

  if (result.error) {
    throw new Error(`Failed to start tar: ${result.error.message}`)
  }

  if (result.status !== 0) {
    throw new Error(`tar exited with status ${result.status ?? 'unknown'}`)
  }
}

export function getGitShortSha(root = repoRoot) {
  return execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
    cwd: root,
    encoding: 'utf8',
  }).trim()
}

export async function packDeploy() {
  const commit = getGitShortSha()
  const releaseDir = path.join(repoRoot, 'release')
  const releaseName = buildReleaseName(commit)
  const stagingDir = path.join(releaseDir, releaseName)
  const archiveName = buildArchiveName(commit)
  const archivePath = path.join(releaseDir, archiveName)

  await mkdir(releaseDir, { recursive: true })
  await rm(stagingDir, { recursive: true, force: true })
  await rm(archivePath, { force: true })
  await mkdir(stagingDir, { recursive: true })

  await copyIncludedPathsToStaging({ stagingDir })

  await writeFile(
    path.join(stagingDir, '.env.production.example'),
    renderDeployEnvExample()
  )
  await writeFile(path.join(stagingDir, 'DEPLOY.md'), renderDeployReadme(commit))
  await writeFile(path.join(stagingDir, 'VERSION'), renderVersionFile(commit))

  runTarArchive({ archiveName, stagingName: releaseName, releaseDir })

  console.log(archivePath)
  return archivePath
}

function isEntrypoint(argv = process.argv) {
  const scriptArg = argv?.[1]
  if (typeof scriptArg !== 'string' || !scriptArg) {
    return false
  }

  return path.resolve(scriptArg) === scriptFilePath
}

if (isEntrypoint()) {
  packDeploy().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
