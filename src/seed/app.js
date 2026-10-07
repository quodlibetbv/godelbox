(async () => {
  const state = JSON.parse(await ace.fs.readText('/data/state.json'));
  if (!state || typeof state.prompt !== 'string') throw new Error('Invalid universe state. Restore a version or use the host prompt to repair it.');
  const input = document.getElementById('become-prompt'), form = document.getElementById('become-form');
  const save = document.getElementById('save-state'), error = document.getElementById('prompt-error'), become = document.getElementById('become');
  input.value = state.prompt;
  let writes = Promise.resolve(), debounce, sequence = 0;
  function persist() {
    clearTimeout(debounce);
    const current = ++sequence, content = JSON.stringify({ prompt: input.value }, null, 2);
    save.textContent = 'Saving…';
    writes = writes.catch(() => {}).then(() => ace.fs.writeText('/data/state.json', content, 'application/json'));
    writes.then(() => { if (current === sequence) save.textContent = 'Saved'; }, () => { if (current === sequence) save.textContent = 'Not saved'; });
    return writes;
  }
  input.addEventListener('input', () => { sequence++; save.textContent = 'Saving…'; clearTimeout(debounce); debounce = setTimeout(persist, 200); });
  async function submit() {
    if (!input.value.trim() || become.disabled) { input.reportValidity(); return; }
    error.hidden = true; become.disabled = true; input.disabled = true;
    try { await persist(); await ace.runtime.requestEdit(input.value.trim()); }
    catch (failure) { error.textContent = failure.message; error.hidden = false; become.disabled = false; input.disabled = false; }
  }
  form.addEventListener('submit', event => { event.preventDefault(); submit(); });
  become.addEventListener('click', submit);
  input.addEventListener('keydown', event => { if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && !event.isComposing) { event.preventDefault(); submit(); } });

  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)'), motion = document.getElementById('motion');
  let paused = reducedMotion.matches, sketch, time = 0;
  function motionState() { motion.textContent = paused ? 'Resume motion' : 'Pause motion'; motion.setAttribute('aria-label', paused ? 'Resume animation' : 'Pause animation'); motion.setAttribute('aria-pressed', String(paused)); if (sketch) { if (paused || document.hidden) sketch.noLoop(); else sketch.loop(); } }
  motion.addEventListener('click', () => { paused = !paused; motionState(); });
  reducedMotion.addEventListener('change', event => { paused = event.matches; motionState(); sketch?.redraw(); });
  document.addEventListener('visibilitychange', motionState);
  sketch = new p5(p => {
    let stars = [], dust = [], halo, pointer = { x: 0, y: 0 };
    const root = document.getElementById('universe');
    function resize() {
      p.resizeCanvas(root.clientWidth, root.clientHeight);
      halo?.remove(); halo = p.createGraphics(640, 480); halo.pixelDensity(1);
      const ctx = halo.drawingContext, glow = ctx.createRadialGradient(320, 240, 0, 320, 240, 300);
      glow.addColorStop(0, 'rgba(210,170,100,0.19)'); glow.addColorStop(.32, 'rgba(99,84,159,0.13)'); glow.addColorStop(.7, 'rgba(38,99,132,0.06)'); glow.addColorStop(1, 'rgba(6,8,20,0)'); ctx.fillStyle = glow; ctx.fillRect(0, 0, 640, 480);
      if (paused) p.redraw();
    }
    p.setup = () => {
      p.pixelDensity(Math.min(devicePixelRatio, 1.5)); p.createCanvas(root.clientWidth, root.clientHeight).parent('cosmos'); p.frameRate(30); p.randomSeed(161906);
      stars = Array.from({ length: 220 }, () => ({ x: p.random(), y: p.random(), size: p.random(.4, 1.7), phase: p.random(p.TWO_PI), depth: p.random(.2, 1) }));
      dust = Array.from({ length: 1400 }, (_, index) => ({ radius: Math.pow(p.random(), .58), angle: p.random(p.TWO_PI), arm: index % 3, scatter: p.randomGaussian(0, .22), size: p.random(.4, 1.9), brightness: p.random(80, 230) }));
      resize(); motionState(); if (paused) p.noLoop(); ace.runtime.ready();
    };
    p.draw = () => {
      time += paused ? 0 : Math.min(p.deltaTime, 60) / 1000;
      p.background(7, 9, 21);
      pointer.x = p.lerp(pointer.x, (p.mouseX / p.width - .5) * 12, .025); pointer.y = p.lerp(pointer.y, (p.mouseY / p.height - .5) * 8, .025);
      const cx = p.width * .53 + pointer.x, cy = Math.min(p.height * .31, 310) + pointer.y, scale = Math.min(p.width * .46, 390);
      p.image(halo, cx - scale * 1.25, cy - scale * .8, scale * 2.5, scale * 1.6);
      p.noStroke();
      for (const star of stars) { const alpha = 100 + 80 * Math.sin(time * .4 + star.phase); p.fill(195, 208, 239, alpha); p.circle(star.x * p.width + pointer.x * star.depth, star.y * p.height + pointer.y * star.depth, star.size); }
      p.push(); p.translate(cx, cy); p.rotate(-.32);
      for (const star of dust) {
        const r = star.radius * scale, angle = star.arm * p.TWO_PI / 3 + star.radius * 6 + star.scatter + time * .045;
        const x = Math.cos(angle) * r, y = Math.sin(angle) * r * .46;
        const warm = star.radius < .36; p.fill(warm ? 242 : 102 + star.radius * 66, warm ? 198 : 168, warm ? 124 : 230, star.brightness * (1 - star.radius * .55));
        p.circle(x, y, star.size * (warm ? 1.25 : 1));
      }
      p.noFill();
      for (let ring = 0; ring < 7; ring++) { p.stroke(232, 192, 123, 48 - ring * 6); p.strokeWeight(.6); p.ellipse(0, 0, 35 + ring * 3.5, 12 + ring * 1.25); }
      p.noStroke(); p.fill(255, 229, 178, 220); p.ellipse(0, 0, 5, 3); p.pop();
      const phase = time % 12;
      if (!paused && phase < 1.1) { const x = p.width * .14 + phase * p.width * .25, y = p.height * .11 + phase * 48; p.stroke(157, 199, 241, Math.sin(phase / 1.1 * Math.PI) * 150); p.strokeWeight(1); p.line(x - 45, y - 12, x, y); }
    };
    p.windowResized = resize;
  });
})().catch(error => { setTimeout(() => { throw error; }); });
