const Anthropic = require('@anthropic-ai/sdk');

const CLAUDE_MODEL = 'claude-sonnet-4-6';
const DEFAULT_TIMEOUT_MS = 30000;
const DEFAULT_MAX_RETRIES = 2;

let client = null;

function getClient() {
  if (!client) {
    client = new Anthropic.Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
  }
  return client;
}

/**
 * Parse JSON from Claude responses that may include markdown fences or extra prose.
 * @param {string} text
 * @returns {{ success: true, data: unknown } | { success: false, error: string }}
 */
function safeJsonParse(text) {
  try {
    if (text === undefined || text === null) {
      return { success: false, error: 'Empty or invalid response text' };
    }

    if (typeof text !== 'string') {
      return { success: false, error: 'Response is not a string' };
    }

    let cleaned = text.trim();
    if (!cleaned) {
      return { success: false, error: 'Empty or invalid response text' };
    }

    const fencedMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fencedMatch) {
      cleaned = fencedMatch[1].trim();
    }

    try {
      return { success: true, data: JSON.parse(cleaned) };
    } catch {
      // Continue to substring extraction.
    }

    const objectStart = cleaned.indexOf('{');
    const arrayStart = cleaned.indexOf('[');
    let start = -1;

    if (objectStart >= 0 && (arrayStart < 0 || objectStart < arrayStart)) {
      start = objectStart;
    } else if (arrayStart >= 0) {
      start = arrayStart;
    }

    if (start < 0) {
      return { success: false, error: 'Could not parse JSON from response' };
    }

    const candidate = cleaned.slice(start);
    const endBrace = candidate.lastIndexOf('}');
    const endBracket = candidate.lastIndexOf(']');
    const end = Math.max(endBrace, endBracket);

    if (end < 0) {
      return { success: false, error: 'Could not parse JSON from response' };
    }

    try {
      return { success: true, data: JSON.parse(candidate.slice(0, end + 1)) };
    } catch (error) {
      return { success: false, error: `Invalid JSON: ${error.message}` };
    }
  } catch (error) {
    return { success: false, error: error.message || 'JSON parse failed' };
  }
}

async function callClaude({ imageBase64, prompt, mimeType }) {
  const anthropic = getClient();

  const response = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: mimeType,
              data: imageBase64,
            },
          },
          {
            type: 'text',
            text: prompt,
          },
        ],
      },
    ],
  });

  const textBlock = response.content.find((block) => block.type === 'text');
  return textBlock?.text || '';
}

/**
 * Send a document image to Claude Sonnet and parse a JSON response.
 * @param {{
 *   imageBase64: string,
 *   prompt: string,
 *   mimeType?: string,
 *   timeoutMs?: number,
 *   maxRetries?: number,
 *   callFn?: Function
 * }} params
 */
async function analyzeDocument({
  imageBase64,
  prompt,
  mimeType = 'image/jpeg',
  timeoutMs = DEFAULT_TIMEOUT_MS,
  maxRetries = DEFAULT_MAX_RETRIES,
  callFn = callClaude,
}) {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return { success: false, error: 'ANTHROPIC_API_KEY is not configured' };
    }

    if (!imageBase64) {
      return { success: false, error: 'imageBase64 is required' };
    }

    if (!prompt) {
      return { success: false, error: 'prompt is required' };
    }

    const attempts = maxRetries + 1;
    let lastError = 'Anthropic analysis failed';

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        const responseText = await Promise.race([
          callFn({ imageBase64, prompt, mimeType }),
          new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Anthropic request timed out')), timeoutMs);
          }),
        ]);

        const parsed = safeJsonParse(responseText);
        if (!parsed.success) {
          lastError = parsed.error;
          continue;
        }

        return { success: true, data: parsed.data };
      } catch (error) {
        lastError = error.message || 'Anthropic analysis failed';
      }
    }

    return { success: false, error: lastError };
  } catch (error) {
    return { success: false, error: error.message || 'Unexpected Anthropic error' };
  }
}

function __setClientForTests(mockClient) {
  client = mockClient;
}

function __resetClientForTests() {
  client = null;
}

module.exports = {
  CLAUDE_MODEL,
  safeJsonParse,
  analyzeDocument,
  __setClientForTests,
  __resetClientForTests,
};
