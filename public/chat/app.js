(() => {
  const messages = document.querySelector('#messages'); const form = document.querySelector('#form');
  const input = document.querySelector('#message'); const provider = document.querySelector('#provider'); const model = document.querySelector('#model');
  const history = [];
  function add(role, content) { messages.querySelector('.empty-state')?.remove(); const el = document.createElement('div'); el.className = `bubble ${role}`; el.textContent = content; messages.append(el); messages.scrollTop = messages.scrollHeight; }
  form.addEventListener('submit', async (event) => { event.preventDefault(); const message = input.value.trim(); if (!message) return; input.value = ''; add('user', message); const button = form.querySelector('button'); button.disabled = true;
    try { const response = await fetch('/api/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ message, history, provider: provider.value, model: model.value.trim() }) }); const data = await response.json(); const reply = data.reply || data.error || 'ไม่พบคำตอบ'; add('assistant', reply); if (data.reply) { history.push({ role: 'user', content: message }, { role: 'assistant', content: data.reply }); } }
    catch { add('assistant', 'เกิดข้อผิดพลาดในการเชื่อมต่อ backend กรุณาลองใหม่'); } finally { button.disabled = false; input.focus(); }
  });
})();