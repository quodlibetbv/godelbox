(async () => {
  const state = JSON.parse(await ace.fs.readText('/data/state.json'));
  if (!state || !Number.isFinite(state.counter) || typeof state.note !== 'string') throw new Error('Invalid /data/state.json: counter must be a number and note must be text. Restore a version or use the host prompt to repair it.');
  let sequence = 0, writes = Promise.resolve();
  const app = Vue.createApp({
    data: () => ({ counter: state.counter, note: state.note, saving: 'Saved' }),
    methods: {
      persist() {
        const current = ++sequence;
        const content = JSON.stringify({ counter: this.counter, note: this.note }, null, 2);
        this.saving = 'Saving…';
        writes = writes.catch(() => {}).then(() => ace.fs.writeText('/data/state.json', content, 'application/json'));
        writes.then(() => { if (current === sequence) this.saving = 'Saved'; }, error => {
          if (current === sequence) this.saving = 'Not saved';
          console.error(error);
        });
      },
    },
  });
  app.mount('#seed');
  ace.runtime.ready();
})().catch(error => { setTimeout(() => { throw error; }); });
