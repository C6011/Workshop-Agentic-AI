import type { ChatMessage, McpTool, ToolCaller, ToolTraceEntry } from '../types';

export async function runOpenAiCompatConversation(
  baseUrl: string | undefined, apiKey: string | undefined, model: string, systemPrompt: string,
  history: ChatMessage[], tools: McpTool[], callTool?: ToolCaller,
): Promise<{ reply: string; toolTrace: ToolTraceEntry[] }> {
  if (!baseUrl?.trim() || baseUrl.trim().toLowerCase() === 'replace base url') return { reply: 'ยังไม่ได้ตั้งค่า OPENAI_COMPAT_BASE_URL กรุณาตั้งค่า base URL ก่อนใช้งาน gateway', toolTrace: [] };
  if (!apiKey?.trim()) return { reply: 'ยังไม่ได้ตั้งค่า OPENAI_COMPAT_API_KEY กรุณาตั้งค่า key ก่อนใช้งาน gateway', toolTrace: [] };
  const messages: Array<Record<string, unknown>> = [{ role: 'system', content: systemPrompt }, ...history];
  const trace: ToolTraceEntry[] = [];
  const endpoint = `${baseUrl.replace(/\/$/, '')}/chat/completions`;
  for (let round = 0; round < 4; round += 1) {
    const body: Record<string, unknown> = { model, messages };
    if (tools.length) {
      body.tools = tools.map((tool) => ({ type: 'function', function: { name: `${tool.serverId}__${tool.name}`, description: tool.description, parameters: tool.inputSchema } }));
      body.tool_choice = 'auto';
    }
    try {
      const response = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` }, body: JSON.stringify(body) });
      if (!response.ok) return { reply: `AI provider ตอบกลับผิดพลาด (${response.status}) กรุณาตรวจสอบการตั้งค่าและลองใหม่`, toolTrace: trace };
      const data = await response.json() as any;
      const message = data?.choices?.[0]?.message;
      if (!message) return { reply: 'AI provider ไม่ส่งข้อความตอบกลับ', toolTrace: trace };
      const calls = message.tool_calls ?? [];
      if (!calls.length) return { reply: message.content || 'โมเดลไม่ส่งข้อความตอบกลับ', toolTrace: trace };
      if (!callTool) return { reply: message.content || 'โมเดลร้องขอเครื่องมือ แต่ยังไม่มีเครื่องมือในโมดูลนี้', toolTrace: trace };
      messages.push(message);
      for (const call of calls) {
        const args = JSON.parse(call.function.arguments || '{}'); const result = await callTool(call.function.name, args);
        trace.push({ name: call.function.name, arguments: args, result });
        messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) });
      }
    } catch {
      return { reply: 'ไม่สามารถเชื่อมต่อ AI provider ได้ กรุณาตรวจสอบเครือข่ายหรือการตั้งค่า key', toolTrace: trace };
    }
  }
  return { reply: 'การเรียกเครื่องมือใช้รอบเกินกำหนด กรุณาลองใหม่', toolTrace: trace };
}