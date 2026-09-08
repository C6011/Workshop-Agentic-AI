import type { ChatMessage, McpTool, ToolCaller, ToolTraceEntry } from '../types';
import { toGeminiSchema } from '../tool-schema';

type GeminiResult = { reply: string; toolTrace: ToolTraceEntry[] };

export async function runGeminiConversation(
  apiKey: string | undefined, model: string, systemPrompt: string,
  history: ChatMessage[], tools: McpTool[], callTool?: ToolCaller,
): Promise<GeminiResult> {
  if (!apiKey?.trim()) return { reply: 'ยังไม่ได้ตั้งค่า GEMINI_API_KEY กรุณาตั้งค่า key ก่อนใช้งาน Gemini', toolTrace: [] };
  const contents: Array<Record<string, unknown>> = history.map((message) => ({
    role: message.role === 'assistant' ? 'model' : 'user', parts: [{ text: message.content }],
  }));
  const trace: ToolTraceEntry[] = [];
  for (let round = 0; round < 4; round += 1) {
    const body: Record<string, unknown> = { systemInstruction: { parts: [{ text: systemPrompt }] }, contents };
    if (tools.length) body.tools = [{ functionDeclarations: tools.map((tool) => ({ name: `${tool.serverId}__${tool.name}`, description: tool.description, parameters: toGeminiSchema(tool.inputSchema) })) }];
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
      });
      if (!response.ok) return { reply: `Gemini ตอบกลับผิดพลาด (${response.status}) กรุณาตรวจสอบการตั้งค่าและลองใหม่`, toolTrace: trace };
      const data = await response.json() as any;
      const parts = data?.candidates?.[0]?.content?.parts ?? [];
      const calls = parts.filter((part: any) => part.functionCall);
      const text = parts.filter((part: any) => typeof part.text === 'string').map((part: any) => part.text).join('');
      if (!calls.length) return { reply: text || 'โมเดลไม่ส่งข้อความตอบกลับ', toolTrace: trace };
      if (!callTool) return { reply: text || 'โมเดลร้องขอเครื่องมือ แต่ยังไม่มีเครื่องมือในโมดูลนี้', toolTrace: trace };
      contents.push({ role: 'model', parts });
      const functionResponses = [];
      for (const call of calls) {
        const name = call.functionCall.name as string;
        const args = call.functionCall.args ?? {};
        const result = await callTool(name, args); trace.push({ name, arguments: args, result });
        functionResponses.push({ functionResponse: { name, response: { result } } });
      }
      contents.push({ role: 'user', parts: functionResponses });
    } catch {
      return { reply: 'ไม่สามารถเชื่อมต่อ Gemini ได้ กรุณาตรวจสอบเครือข่ายหรือการตั้งค่า key', toolTrace: trace };
    }
  }
  return { reply: 'การเรียกเครื่องมือใช้รอบเกินกำหนด กรุณาลองใหม่', toolTrace: trace };
}