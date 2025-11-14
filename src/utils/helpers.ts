/**
 * 辅助工具函数
 */

/**
 * 生成随机字符串
 */
export function generateRandomString(
  length: number = 8,
  charset: string = 'abcdefghijklmnopqrstuvwxyz0123456789'
): string {
  let result = ''
  for (let i = 0; i < length; i++) {
    result += charset.charAt(Math.floor(Math.random() * charset.length))
  }
  return result
}

/**
 * 常用英文单词片段库（用于生成真实的邮箱前缀）
 * 包含常见人名、中性词汇等，避免使用 test/demo 等明显的测试词汇
 */
const WORD_FRAGMENTS = [
  // 常见英文人名片段
  'john',
  'jane',
  'mike',
  'sarah',
  'alex',
  'chris',
  'david',
  'emma',
  'james',
  'mary',
  'robert',
  'lisa',
  'michael',
  'anna',
  'william',
  'linda',
  'richard',
  'susan',
  'thomas',
  'karen',
  'charles',
  'nancy',
  'daniel',
  'betty',
  'paul',
  'helen',
  'mark',
  'sandra',
  'donald',
  'ashley',
  'george',
  'kimberly',
  'kenneth',
  'donna',
  'steven',
  'carol',
  'edward',
  'michelle',
  'brian',
  'emily',

  // 常用短单词（3-6个字母）
  'hello',
  'world',
  'user',
  'mail',
  'info',
  'contact',
  'admin',
  'support',
  'love',
  'life',
  'star',
  'moon',
  'sun',
  'sky',
  'blue',
  'red',
  'cool',
  'nice',
  'good',
  'best',
  'top',
  'pro',
  'max',
  'plus',
  'new',
  'old',
  'big',
  'small',
  'fast',
  'slow',
  'hot',
  'cold',
  'happy',
  'lucky',
  'smart',
  'super',
  'mega',
  'ultra',
  'prime',
  'elite',

  // 常见名词
  'king',
  'queen',
  'prince',
  'tiger',
  'lion',
  'eagle',
  'wolf',
  'bear',
  'ocean',
  'river',
  'mountain',
  'forest',
  'garden',
  'flower',
  'tree',
  'leaf',
  'book',
  'music',
  'art',
  'game',
  'sport',
  'team',
  'club',
  'group',
  'city',
  'town',
  'street',
  'road',
  'house',
  'home',
  'room',
  'door',

  // 常见动词
  'run',
  'jump',
  'fly',
  'swim',
  'walk',
  'talk',
  'sing',
  'dance',
  'play',
  'work',
  'study',
  'learn',
  'teach',
  'help',
  'love',
  'like',
  'make',
  'create',
  'build',
  'design',
  'write',
  'read',
  'think',
  'dream',

  // 常见形容词
  'bright',
  'dark',
  'light',
  'heavy',
  'soft',
  'hard',
  'smooth',
  'rough',
  'young',
  'fresh',
  'clean',
  'clear',
  'pure',
  'true',
  'real',
  'wild',
  'free',
  'open',
  'close',
  'wide',
  'narrow',
  'deep',
  'high',
  'low',

  // 其他常用词
  'my',
  'your',
  'our',
  'the',
  'one',
  'two',
  'first',
  'last',
  'day',
  'night',
  'time',
  'year',
  'week',
  'hour',
  'moment',
  'season',
  'spring',
  'summer',
  'fall',
  'winter',
  'east',
  'west',
  'north',
  'south',
]

/**
 * 生成随机邮箱前缀（优化版）
 * 生成更真实自然的邮箱前缀，而不是纯随机字符串
 *
 * 生成策略：
 * 1. 随机选择 2-3 个单词片段进行组合
 * 2. 30-40% 的概率在单词之间使用分隔符（-）
 * 3. 在合适位置插入 2-4 位随机数字
 * 4. 最终长度控制在 8-16 字符之间
 *
 * @param length 目标长度参考值（实际生成长度在 8-16 之间浮动）
 * @returns 真实自然的邮箱前缀
 *
 * @example
 * generateEmailPrefix() // 可能返回: "john_doe13", "helloworld2024", "user-mail88"
 */
export function generateEmailPrefix(length: number = 8): string {
  // 随机选择 2-3 个单词片段
  const wordCount = Math.random() < 0.5 ? 2 : 3
  const selectedWords: string[] = []

  for (let i = 0; i < wordCount; i++) {
    const randomIndex = Math.floor(Math.random() * WORD_FRAGMENTS.length)
    selectedWords.push(WORD_FRAGMENTS[randomIndex])
  }

  // 决定是否使用分隔符（30% 概率）
  const useSeparator = Math.random() < 0.3
  const separator = useSeparator ? '-' : ''

  // 组合单词
  let prefix = selectedWords.join(separator)

  // 生成 2-4 位随机数字
  const digitCount = Math.floor(Math.random() * 3) + 2 // 2-4
  const digits = Math.floor(Math.random() * Math.pow(10, digitCount))
    .toString()
    .padStart(digitCount, '0')

  // 决定数字的位置（70% 概率在末尾，30% 概率在中间）
  if (Math.random() < 0.7) {
    // 数字在末尾
    prefix = prefix + digits
  } else {
    // 数字在中间（在某个单词后面）
    const insertPosition = selectedWords[0].length + (separator ? 1 : 0)
    prefix =
      prefix.slice(0, insertPosition) + digits + prefix.slice(insertPosition)
  }

  // 确保长度在 8-16 之间
  if (prefix.length < 8) {
    // 如果太短，添加更多数字
    const additionalDigits = Math.floor(Math.random() * 100).toString()
    prefix = prefix + additionalDigits
  } else if (prefix.length > 16) {
    // 如果太长，截断
    prefix = prefix.slice(0, 16)
  }

  // 确保不以数字开头（邮箱地址规范）
  if (/^\d/.test(prefix)) {
    prefix =
      WORD_FRAGMENTS[Math.floor(Math.random() * WORD_FRAGMENTS.length)] + prefix
    if (prefix.length > 16) {
      prefix = prefix.slice(0, 16)
    }
  }

  return prefix
}

/**
 * 生成唯一 ID
 */
export function generateId(): string {
  return `${Date.now()}-${generateRandomString(6)}`
}

/**
 * 验证邮箱地址格式
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}

/**
 * 提取邮箱的用户名和域名
 */
export function parseEmail(
  email: string
): { username: string; domain: string } | null {
  if (!isValidEmail(email)) {
    return null
  }

  const [username, domain] = email.split('@')
  return { username, domain }
}

/**
 * 格式化时间戳
 */
export function formatTimestamp(date: Date | string | number): string {
  const d = new Date(date)
  return d.toISOString()
}

/**
 * 解析时间字符串
 */
export function parseDate(dateString: string): Date {
  // 尝试多种日期格式
  let date = new Date(dateString)

  if (isNaN(date.getTime())) {
    // 尝试其他格式
    const formats = [
      /^(\d{4})\/(\d{2})\/(\d{2}) (\d{2}):(\d{2}):(\d{2})$/, // YYYY/MM/DD HH:mm:ss
      /^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2}):(\d{2})$/, // DD/MM/YYYY HH:mm:ss
    ]

    for (const format of formats) {
      const match = dateString.match(format)
      if (match) {
        if (format === formats[0]) {
          // YYYY/MM/DD HH:mm:ss
          date = new Date(
            parseInt(match[1]),
            parseInt(match[2]) - 1,
            parseInt(match[3]),
            parseInt(match[4]),
            parseInt(match[5]),
            parseInt(match[6])
          )
        } else if (format === formats[1]) {
          // DD/MM/YYYY HH:mm:ss
          date = new Date(
            parseInt(match[3]),
            parseInt(match[2]) - 1,
            parseInt(match[1]),
            parseInt(match[4]),
            parseInt(match[5]),
            parseInt(match[6])
          )
        }
        break
      }
    }
  }

  return isNaN(date.getTime()) ? new Date() : date
}

/**
 * 延迟执行
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * 重试执行函数
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: {
    retries: number
    delay?: number
    backoff?: boolean
  }
): Promise<T> {
  const { retries, delay: baseDelay = 1000, backoff = true } = options

  let lastError: Error

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))

      if (attempt === retries) {
        throw lastError
      }

      const delayMs = backoff ? baseDelay * Math.pow(2, attempt) : baseDelay
      await delay(delayMs)
    }
  }

  throw lastError!
}

/**
 * 安全的 JSON 解析
 */
export function safeJsonParse<T = any>(
  jsonString: string,
  defaultValue?: T
): T | null {
  try {
    return JSON.parse(jsonString)
  } catch {
    return defaultValue ?? null
  }
}

/**
 * 清理 HTML 标签
 */
export function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').trim()
}

/**
 * 截取文本
 */
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text
  }
  return text.substring(0, maxLength - 3) + '...'
}

/**
 * 获取预览文本
 */
export function getEmailPreview(
  content: string,
  maxLength: number = 100
): string {
  const cleanText = stripHtml(content)
  return truncateText(cleanText, maxLength)
}

/**
 * 计算字符串哈希值
 */
export function simpleHash(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = (hash << 5) - hash + char
    hash = hash & hash // 转换为32位整数
  }
  return hash
}

/**
 * 检查是否为有效的 URL
 */
export function isValidUrl(url: string): boolean {
  try {
    new URL(url)
    return true
  } catch {
    return false
  }
}

/**
 * 合并对象（深度合并）
 */
export function deepMerge<T extends Record<string, any>>(
  target: T,
  source: Partial<T>
): T {
  const result = { ...target }

  for (const key in source) {
    const sourceValue = source[key]
    const targetValue = result[key]

    if (
      sourceValue &&
      typeof sourceValue === 'object' &&
      !Array.isArray(sourceValue) &&
      targetValue &&
      typeof targetValue === 'object' &&
      !Array.isArray(targetValue)
    ) {
      result[key] = deepMerge(targetValue, sourceValue)
    } else {
      result[key] = sourceValue as T[typeof key]
    }
  }

  return result
}

/**
 * 检查对象是否为空
 */
export function isEmpty(obj: any): boolean {
  if (obj == null) return true
  if (Array.isArray(obj) || typeof obj === 'string') return obj.length === 0
  if (typeof obj === 'object') return Object.keys(obj).length === 0
  return false
}
