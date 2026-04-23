/**
 * ClawBoard - Ollama AI 集成
 * 本地 LLM 提供摘要、标签、搜索增强
 * v0.47.0: 支持自定义模型与提示词模板
 */

const http = require('http');
const log = require('electron-log');

// 默认配置
const DEFAULT_HOST = 'http://localhost:11434';
const DEFAULT_MODEL = 'qwen2.5:3b';
const DEFAULT_EMBED_MODEL = 'nomic-embed-text';

// 默认提示词模板
const DEFAULT_PROMPTS = {
  summarize: '请为以下内容生成一个简短的中文摘要（不超过50字）：\n\n{{content}}',
  tags: '请为以下内容生成3-5个中文标签（用逗号分隔）：\n\n{{content}}',
  searchEnhance: '将以下搜索query转换为一个更适合搜索的关键词短句（保留核心语义，去除口语化表达）：\n\n搜索: {{query}}\n\n只输出转换后的关键词，不要其他解释。',
};

// 当前 AI 配置（可通过 updateConfig 动态修改）
let aiConfig = {
  host: DEFAULT_HOST,
  model: DEFAULT_MODEL,
  embedModel: DEFAULT_EMBED_MODEL,
  prompts: { ...DEFAULT_PROMPTS },
  temperature: 0.7,
  maxTokens: 200,
};

/**
 * 更新 AI 配置
 */
function updateConfig(config) {
  if (config.host) aiConfig.host = config.host;
  if (config.model) aiConfig.model = config.model;
  if (config.embedModel) aiConfig.embedModel = config.embedModel;
  if (config.temperature !== undefined) aiConfig.temperature = config.temperature;
  if (config.maxTokens !== undefined) aiConfig.maxTokens = config.maxTokens;
  if (config.prompts) {
    // 合并提示词模板，保留自定义值
    aiConfig.prompts = {
      ...DEFAULT_PROMPTS,
      ...aiConfig.prompts,
      ...config.prompts,
    };
  }
  log.info('AI 配置已更新:', JSON.stringify(aiConfig, null, 2));
}

/**
 * 获取当前 AI 配置
 */
function getConfig() {
  return { ...aiConfig };
}

/**
 * 获取默认提示词模板
 */
function getDefaultPrompts() {
  return { ...DEFAULT_PROMPTS };
}

/**
 * 渲染提示词模板（替换变量）
 */
function renderPrompt(template, variables) {
  let result = template;
  for (const [key, value] of Object.entries(variables)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
  }
  return result;
}

/**
 * 生成摘要
 */
async function summarize(text) {
  if (!text || text.length < 50) return text;

  try {
    const template = aiConfig.prompts.summarize || DEFAULT_PROMPTS.summarize;
    const prompt = renderPrompt(template, { content: text.substring(0, 1000) });
    const result = await _chat(prompt);
    return result;
  } catch (err) {
    log.warn('AI 摘要生成失败:', err.message);
    return null;
  }
}

/**
 * 为内容生成标签
 */
async function generateTags(text) {
  try {
    const template = aiConfig.prompts.tags || DEFAULT_PROMPTS.tags;
    const prompt = renderPrompt(template, { content: text.substring(0, 500) });
    const result = await _chat(prompt);
    if (result) {
      return result.split(/[,，、]/).map(t => t.trim()).filter(t => t.length > 0).slice(0, 5);
    }
    return [];
  } catch (err) {
    log.warn('AI 标签生成失败:', err.message);
    return [];
  }
}

/**
 * 自然语言搜索增强
 */
async function searchEnhance(query) {
  try {
    const template = aiConfig.prompts.searchEnhance || DEFAULT_PROMPTS.searchEnhance;
    const prompt = renderPrompt(template, { query });
    const result = await _chat(prompt);
    return result || query;
  } catch (err) {
    log.warn('搜索增强失败:', err.message);
    return query;
  }
}

/**
 * 生成嵌入向量（用于语义搜索）
 */
async function getEmbedding(text) {
  try {
    const body = JSON.stringify({
      model: aiConfig.embedModel,
      input: text.substring(0, 2000),
    });

    const result = await _request('POST', '/api/embeddings', body);
    return result.embedding;
  } catch (err) {
    log.warn('嵌入生成失败:', err.message);
    return null;
  }
}

/**
 * 检查 Ollama 是否可用
 */
async function checkHealth() {
  try {
    const result = await _request('GET', '/api/tags');
    return result.models && result.models.length > 0;
  } catch {
    return false;
  }
}

/**
 * 获取已安装的模型列表
 */
async function listModels() {
  try {
    const result = await _request('GET', '/api/tags');
    return (result.models || []).map(m => m.name);
  } catch {
    return [];
  }
}

/**
 * 测试指定模型的连接
 */
async function testModel(modelName) {
  try {
    const body = JSON.stringify({
      model: modelName || aiConfig.model,
      prompt: '你好',
      stream: false,
      options: {
        temperature: 0.5,
        num_predict: 20,
      }
    });
    const result = await _request('POST', '/api/generate', body);
    return { success: true, response: result.response?.trim() };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ==================== 内部方法 ====================

async function _chat(prompt, model) {
  const body = JSON.stringify({
    model: model || aiConfig.model,
    prompt,
    stream: false,
    options: {
      temperature: aiConfig.temperature,
      num_predict: aiConfig.maxTokens,
    }
  });

  const result = await _request('POST', '/api/generate', body);
  return result.response?.trim();
}

function _request(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, aiConfig.host);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method,
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          reject(new Error('Invalid JSON response'));
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    if (body) {
      req.write(body);
    }
    req.end();
  });
}

module.exports = {
  summarize,
  generateTags,
  searchEnhance,
  getEmbedding,
  checkHealth,
  listModels,
  testModel,
  updateConfig,
  getConfig,
  getDefaultPrompts,
};
