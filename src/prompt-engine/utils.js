/**
 * Prompt Engine - Utils
 * 通用工具函数（不包含业务逻辑）
 */

/**
 * 安全拼接字符串（过滤空值）
 */
export function joinNonEmpty(parts = [], separator = ' ') {
  return parts
    .filter(p => typeof p === 'string' && p.trim().length > 0)
    .join(separator)
    .trim()
}

/**
 * 将数组转为逗号分隔 prompt 片段
 */
export function arrayToPrompt(arr = []) {
  if (!Array.isArray(arr)) return ''
  return arr.filter(Boolean).join(', ')
}

/**
 * 权重包裹（兼容 SD / Ideogram 风格）
 * e.g. weight("minimal logo", 1.2) -> "(minimal logo:1.2)"
 */
export function weight(text, value = 1.1) {
  if (!text) return ''
  return `(${text}:${value})`
}

/**
 * 安全转小写 + 下划线
 */
export function normalizeKey(str = '') {
  return String(str)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
}

/**
 * 限制 prompt 最大长度（防止炸模型）
 */
export function limitLength(text = '', max = 1200) {
  if (!text) return ''
  if (text.length <= max) return text
  return text.slice(0, max)
}

/**
 * 随机取 N 个（用于多样性）
 */
export function sample(arr = [], count = 1) {
  if (!Array.isArray(arr)) return []
  return [...arr]
    .sort(() => 0.5 - Math.random())
    .slice(0, count)
}

/**
 * Boolean → prompt 片段
 */
export function boolPrompt(flag, text) {
  return flag ? text : ''
}

/**
 * debug 辅助（后期可接 logger）
 */
export function debug(label, data) {
  if (process.env.NODE_ENV !== 'production') {
    console.log(`[PromptEngine] ${label}`, data)
  }
}