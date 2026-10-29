/* Background: a slowly turning DNA double helix across the window, with faint bases and bits of Python
   drifting past like particles in a flow cell. Kept subtle so it never competes with the text. */
(function () {
  const cv = document.getElementById("bg");
  if (!cv) return;
  const ctx = cv.getContext("2d");
  const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let W = 0, H = 0, dpr = 1, t0 = performance.now(), last = 0;
  const TOKENS = ["def", "for", "if", "in", "print()", "len()", "[ ]", "{ }", ">>>", "import", "return", "f\"\"", "==", "range", "A", "T", "G", "C", "ATG", "TAA", "GC%", "5'", "3'"];
  let parts = [];
  const dark = () => document.documentElement.getAttribute("data-theme") === "dark";
  const BASE = { A: [52, 199, 89], T: [255, 69, 58], G: [255, 159, 10], C: [10, 132, 255] };
  const PAIR = { A: "T", T: "A", G: "C", C: "G" };
  const strand = Array.from({ length: 400 }, () => "ATGC"[Math.floor(Math.random() * 4)]);

  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = window.innerWidth; H = window.innerHeight;
    cv.width = W * dpr; cv.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const n = Math.round(Math.min(46, W * H / 32000));
    parts = Array.from({ length: n }, () => newPart(true));
  }
  function newPart(anywhere) {
    return {
      x: anywhere ? Math.random() * W : -60, y: Math.random() * H,
      v: 6 + Math.random() * 14, s: 10 + Math.random() * 7, a: 0.25 + Math.random() * 0.75,
      w: Math.random() * Math.PI * 2, txt: TOKENS[Math.floor(Math.random() * TOKENS.length)],
    };
  }

  function frame(now) {
    requestAnimationFrame(frame);
    if (document.hidden || now - last < 33) return;   // ~30 fps is plenty for a background
    last = now;
    const t = (now - t0) / 1000;
    const dk = dark();
    ctx.clearRect(0, 0, W, H);

    // drifting tokens
    ctx.textBaseline = "middle";
    for (const p of parts) {
      p.x += p.v / 30; p.w += 0.01;
      if (p.x > W + 80) Object.assign(p, newPart(false));
      const y = p.y + Math.sin(p.w) * 10;
      ctx.font = `${p.s}px ui-monospace, "SF Mono", Menlo, monospace`;
      ctx.fillStyle = dk ? `rgba(160,190,255,${0.07 * p.a})` : `rgba(40,70,140,${0.075 * p.a})`;
      ctx.fillText(p.txt, p.x, y);
    }

    // helix
    const cy = H * 0.78, amp = Math.min(70, H * 0.08), step = 22, k = (2 * Math.PI) / 260;
    const phase = reduce ? 0 : t * 0.55, shift = reduce ? 0 : (t * 14) % step;
    const n = Math.ceil(W / step) + 3;
    const off = Math.floor((reduce ? 0 : t * 14) / step);
    const a0 = dk ? 0.20 : 0.16;
    // rungs (base pairs) first, coloured by base, fading with depth
    for (let i = -1; i < n; i++) {
      const x = i * step - shift;
      const th = x * k + phase;
      const y1 = cy + Math.sin(th) * amp, y2 = cy + Math.sin(th + Math.PI) * amp;
      const depth = (Math.cos(th) + 1) / 2;
      const b = strand[(i + off + 4000) % strand.length];
      const c1 = BASE[b], c2 = BASE[PAIR[b]];
      const mid = (y1 + y2) / 2;
      ctx.lineWidth = 2.2;
      ctx.strokeStyle = `rgba(${c1},${a0 * (0.35 + 0.65 * depth)})`;
      ctx.beginPath(); ctx.moveTo(x, y1); ctx.lineTo(x, mid); ctx.stroke();
      ctx.strokeStyle = `rgba(${c2},${a0 * (0.35 + 0.65 * (1 - depth))})`;
      ctx.beginPath(); ctx.moveTo(x, mid); ctx.lineTo(x, y2); ctx.stroke();
    }
    // the two backbones
    for (const ph of [0, Math.PI]) {
      ctx.beginPath();
      for (let x = -20; x <= W + 20; x += 6) {
        const y = cy + Math.sin(x * k + phase + ph) * amp;
        x === -20 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.lineWidth = 3;
      ctx.strokeStyle = dk ? `rgba(120,170,255,${a0 + 0.04})` : `rgba(0,113,227,${a0})`;
      ctx.stroke();
    }
  }
  window.addEventListener("resize", resize);
  resize();
  requestAnimationFrame(frame);
})();
