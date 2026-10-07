// Browser-ready files returned by synthetic editor tools, never a production app mode.
export const assistantFiles = {
  '/app/boot.json': JSON.stringify({ format: 1, html: '/app/index.html', styles: ['/app/styles.css'], scripts: ['/app/app.js'] }),
  '/app/index.html': '<main><h1>Your motivational assistant</h1><section id="chat" aria-label="Assistant conversation" aria-live="polite"></section><form id="ask"><label for="question">What is on your mind?</label><textarea id="question" required></textarea><button type="button">Ask assistant</button></form><p id="status" role="status">Ready</p><p id="error" role="alert" hidden></p></main>',
  '/app/styles.css': 'body{margin:0;background:#faf9f5;color:#20241c;font:18px system-ui}main{max-width:42rem;margin:auto;padding:2rem}textarea{display:block;width:100%;box-sizing:border-box;min-height:6rem}button{margin-top:1rem;padding:.7rem}article{padding:1rem 0;border-bottom:1px solid #aaa;white-space:pre-wrap}',
  '/agent/instructions.md': 'You are a motivational assistant. Help the user choose practical next steps toward their goals. Answer in an encouraging, concrete tone within the app. Keep the conversation under /data/chat.json; ordinary questions never trigger an app edit.',
  '/data/chat.json': '[]',
  '/app/app.js': `(async () => {
    const history = JSON.parse(await ace.fs.readText('/data/chat.json'));
    const chat = document.querySelector('#chat'), input = document.querySelector('#question');
    const status = document.querySelector('#status'), error = document.querySelector('#error'), button = document.querySelector('button');
    function render() { chat.replaceChildren(); for (const message of history) { const row = document.createElement('article'); row.textContent = message.content; row.setAttribute('aria-label', message.role === 'user' ? 'Your message' : 'Assistant response'); chat.append(row); } }
    async function save() { await ace.fs.writeText('/data/chat.json', JSON.stringify(history), 'application/json'); }
    async function ask() {
      if (button.disabled || !input.value.trim()) return;
      button.disabled = true; input.disabled = true; error.hidden = true; status.textContent = 'Thinking…';
      try {
        history.push({ role: 'user', content: input.value.trim() }); await save(); render();
        const reply = await ace.ai.request({ messages: history, maxOutputTokens: 512 });
        history.push({ role: 'assistant', content: reply.text }); await save(); render(); input.value = ''; status.textContent = 'Saved';
      } catch (failure) { error.textContent = failure.message; error.hidden = false; status.textContent = 'Reply failed'; }
      finally { button.disabled = false; input.disabled = false; }
    }
    render(); button.addEventListener('click', ask);
    document.querySelector('#ask').addEventListener('submit', event => { event.preventDefault(); ask(); });
    input.addEventListener('keydown', event => { if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && !event.isComposing) { event.preventDefault(); ask(); } });
    ace.runtime.ready();
  })();`,
}
