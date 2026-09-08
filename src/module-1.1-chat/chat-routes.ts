import type { Env } from '../env';
import { errorJson, json } from '../lib/http';
import { runGeminiConversation } from './providers/gemini';
import { runOpenAiCompatConversation } from './providers/openai-compat';
import type { ChatMessage, ChatProvider, ChatTurnResult, McpTool } from './types';

const DEFAULT_MODELS: Record<ChatProvider, string> = {
  gemini: 'gemini-flash-latest', openai: 'gpt-4o-mini', 'openai-compat': 'gpt-4o-mini',
};

export function buildSystemPrompt(): string {
  return 'คุณคือผู้ช่วย AI ภาษาไทยที่สุภาพ กระชับ และช่วยผู้ใช้แก้ปัญหาอย่างเป็นประโยชน์';
}

export function resolveProvider(value: unknown, env: Env): ChatProvider {
  const provider = value || env.DEFAULT_CHAT_PROVIDER || 'gemini';
  return provider === 'openai' || provider === 'openai-compat' ? provider : 'gemini';
}

export function defaultModelFor(provider: ChatProvider, env: Env): string {
  return (provider === 'gemini' ? env.GEMINI_MODEL : provider === 'openai' ? env.OPENAI_MODEL : env.OPENAI_COMPAT_MODEL) || DEFAULT_MODELS[provider];
}

function resolveApiKey(provider: ChatProvider, env: Env): string | undefined {
  return provider === 'gemini' ? env.GEMINI_API_KEY : provider === 'openai' ? env.OPENAI_API_KEY : env.OPENAI_COMPAT_API_KEY;
}

function resolveBaseUrl(provider: ChatProvider): string | undefined {
  return provider === 'openai' ? 'https://api.openai.com/v1' : undefined;
}

function resolveTools(): McpTool[] { return []; }

export async function runChatTurn(
  env: Env, provider: ChatProvider, model: string, history: ChatMessage[],
): Promise<ChatTurnResult> {
  const tools = resolveTools(); const apiKey = resolveApiKey(provider, env);
  if (provider === 'gemini') {
    const result = await runGeminiConversation(apiKey, model, buildSystemPrompt(), history, tools);
    return { ...result, provider, model };
  }
  const baseUrl = provider === 'openai-compat' ? env.OPENAI_COMPAT_BASE_URL : resolveBaseUrl(provider);
  const result = await runOpenAiCompatConversation(baseUrl, apiKey, model, buildSystemPrompt(), history, tools);
  return { ...result, provider, model };
}

export async function handleChatRoute(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') return errorJson('รองรับเฉพาะ POST /api/chat', 405);
  try {
    const body = await request.json() as { message?: unknown; history?: unknown; provider?: unknown; model?: unknown };
    if (typeof body.message !== 'string' || !body.message.trim()) return errorJson('กรุณาระบุ message เป็นข้อความที่ไม่ว่าง');
    const provider = resolveProvider(body.provider, env);
    const history: ChatMessage[] = Array.isArray(body.history) ? body.history.filter((item): item is ChatMessage => {
      const value = item as Partial<ChatMessage>;
      return !!value && (value.role === 'user' || value.role === 'assistant') && typeof value.content === 'string';
    }) : [];
    history.push({ role: 'user', content: body.message });
    const model = typeof body.model === 'string' && body.model.trim() ? body.model.trim() : defaultModelFor(provider, env);
    return json(await runChatTurn(env, provider, model, history));
  } catch {
    return errorJson('รูปแบบ request ไม่ถูกต้อง กรุณาส่ง JSON ที่มี message เป็นข้อความ', 400);
  }
}