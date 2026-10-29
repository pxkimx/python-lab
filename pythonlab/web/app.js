/* Python Lab — page logic. */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const S = { chapters: [], flat: [], progress: { done: {}, code: {}, hints: {} }, lesson: null, last: { lesson: null, pg: null }, page: "learn" };

async function api(path, body, raw) {
  const opt = body === undefined ? {} : { method: "POST", body: raw ? body : JSON.stringify(body), headers: raw ? {} : { "Content-Type": "application/json" } };
  const r = await fetch(path, opt);
  const j = await r.json().catch(() => ({ error: "The app did not answer." }));
  if (!r.ok || typeof j.error === "string") throw new Error(j.error || r.statusText);
  return j;
}
function toast(msg, ms = 2400) {
  const t = $("#toast"); t.textContent = msg; t.classList.add("on");
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove("on"), ms);
}

/* ---------------- lifecycle: the server quits when the last window closes */
(function hold() { try { const es = new EventSource("/api/window"); es.onerror = () => {}; } catch (e) {} })();

/* ---------------- theme */
function setTheme(t) {
  document.documentElement.setAttribute("data-theme", t);
  try { localStorage.setItem("pl-theme", t); } catch (e) {}
  $$("#themePill button").forEach((b) => b.classList.toggle("on", b.dataset.t === t));
}
$$("#themePill button").forEach((b) => (b.onclick = () => setTheme(b.dataset.t)));
setTheme(document.documentElement.getAttribute("data-theme") || "light");

/* ---------------- pages */
function show(page, push = true) {
  S.page = page;
  $$("#tabs button").forEach((b) => b.classList.toggle("on", b.dataset.p === page));
  $$("section.page").forEach((s) => s.classList.toggle("on", s.id === "p-" + page));
  if (push) {
    const h = page === "lesson" && S.lesson ? "#lesson/" + S.lesson.id : "#" + page;
    if (location.hash !== h) history.pushState(null, "", h);
  }
  if (page === "playground") { pg.refresh(); loadFiles(); }
  if (page === "lesson" && ed) setTimeout(() => ed.refresh(), 0);
  window.scrollTo({ top: 0 });
}
$$("#tabs button").forEach((b) => (b.onclick = () => (b.dataset.p === "lesson" && !S.lesson ? null : show(b.dataset.p))));
$("#brand").onclick = () => show("learn");
$("#backMap").onclick = () => show(S.lesson && S.lesson._kind === "projects" ? "projects" : "learn");
window.addEventListener("popstate", route);
function route() {
  const h = location.hash.slice(1);
  if (h.startsWith("lesson/")) { const id = h.slice(7); if (S.flat.find((l) => l.id === id)) return openLesson(id, false); }
  if (["learn", "projects", "playground", "cheats"].includes(h)) return show(h, false);
  show("learn", false);
}

/* ---------------- icons for chapters */
const ICONS = {
  spark: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5M15.5 8.5L18 6"/>',
  dna: '<path d="M7 3c0 6 10 6 10 12s-10 6-10 6M17 3c0 6-10 6-10 12M8 6h8M8 18h8M9.5 9h5M9.5 15h5"/>',
  loop: '<path d="M17 2l4 4-4 4"/><path d="M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4"/><path d="M21 13v2a3 3 0 0 1-3 3H3"/>',
  branch: '<circle cx="6" cy="5" r="2"/><circle cx="6" cy="19" r="2"/><circle cx="18" cy="9" r="2"/><path d="M6 7v10M18 11c0 4-6 3-12 6"/>',
  table: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M9 4v16"/>',
  function: '<path d="M10 4c-2 0-3 1-3 3v13M4 11h7M14 9l6 8M20 9l-6 8"/>',
  file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>',
  bug: '<rect x="7" y="8" width="10" height="12" rx="5"/><path d="M12 8V5M9 5l1.5 2M15 5l-1.5 2M3 13h4M17 13h4M4 19l3-2M20 19l-3-2M4 7l3 2M20 7l-3 2"/>',
  toolbox: '<rect x="3" y="8" width="18" height="12" rx="2"/><path d="M9 8V5h6v3M3 13h18M10 13v2h4v-2"/>',
  chart: '<path d="M4 20V4M4 20h16"/><path d="M7 15l4-5 3 3 5-7"/>',
  wrench: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.8-.7-.7-2.8z"/>',
  flask: '<path d="M9 3h6M10 3v6L4.5 19a1.5 1.5 0 0 0 1.3 2h12.4a1.5 1.5 0 0 0 1.3-2L14 9V3M7 15h10"/>',
};
const icon = (n) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${ICONS[n] || ICONS.spark}</svg>`;
const HUES = [["#0a84ff", "#5e5ce6"], ["#30b0c7", "#0a84ff"], ["#34c759", "#30b0c7"], ["#ff9f0a", "#ff375f"], ["#5e5ce6", "#bf5af2"],
  ["#ff375f", "#ff9f0a"], ["#00c7be", "#34c759"], ["#ff453a", "#ff9f0a"], ["#64d2ff", "#5e5ce6"], ["#bf5af2", "#ff375f"], ["#8e8e93", "#0a84ff"], ["#ff9f0a", "#34c759"]];

/* ---------------- course map */
const isDone = (id) => !!S.progress.done[id];
function nextLesson() { return S.flat.find((l) => !isDone(l.id)) || null; }
function ring(frac, cls = "ring") {
  return `<svg class="${cls}" viewBox="0 0 36 36"><circle cx="18" cy="18" r="15" class="r-bg"/><circle cx="18" cy="18" r="15" class="r-fg" style="stroke-dashoffset:${94.25 * (1 - frac)}"/></svg>`;
}
function renderMap() {
  const nxt = nextLesson();
  $("#chapters").innerHTML = S.chapters.filter((c) => c.kind !== "projects").map((c, i) => {
    const n = c.lessons.filter((l) => isDone(l.id)).length;
    const [c1, c2] = HUES[i % HUES.length];
    return `<div class="card chap" style="--c1:${c1};--c2:${c2}">
      <div class="ch-top"><div class="ch-ico">${icon(c.icon)}</div>
        <div><div class="ch-n">Chapter ${c.number} · ${n}/${c.lessons.length}</div><h3>${esc(c.title)}</h3><p>${esc(c.blurb)}</p></div>
        ${ring(c.lessons.length ? n / c.lessons.length : 0)}</div>
      <ol>${c.lessons.map((l) => `<li data-l="${l.id}" class="${isDone(l.id) ? "done" : ""} ${nxt && nxt.id === l.id ? "next" : ""}">
        <span class="chk">${isDone(l.id) ? "✓" : ""}</span>${esc(l.title)}<span class="mins">${l.minutes} min</span></li>`).join("")}</ol></div>`;
  }).join("");
  $$("#chapters li").forEach((li) => (li.onclick = () => openLesson(li.dataset.l)));
  // projects
  const proj = S.chapters.filter((c) => c.kind === "projects").flatMap((c) => c.lessons);
  $("#projectList").innerHTML = proj.map((l, i) => {
    const first = (l.text || "").split(/\n\s*\n/).find((p) => p.trim() && !p.startsWith("#") && !p.startsWith("```")) || "";
    const deco = ["ATG…TAA", "GC 52%", "EcoRI", "ΔΔCt", "t½ 28′", "TGA→W", "Q30"][i % 7];
    return `<div class="card proj ${isDone(l.id) ? "done" : ""}" data-l="${l.id}"><div class="p-n">Project ${i + 1}</div><h3>${esc(l.title)}</h3>
      <p>${MD.render(first).replace(/<\/?p>/g, "")}</p><div class="p-meta"><span>≈ ${l.minutes} min</span><span>${l.hints.length} hints</span></div><div class="seqdeco">${deco}</div></div>`;
  }).join("") || '<p class="muted">Projects are being written.</p>';
  $$("#projectList .proj").forEach((p) => (p.onclick = () => openLesson(p.dataset.l)));
  // stats + continue
  const done = S.flat.filter((l) => isDone(l.id)).length, total = S.flat.length;
  const frac = total ? done / total : 0;
  $("#meterArc").style.strokeDashoffset = 94.25 * (1 - frac);
  $("#meterText").textContent = Math.round(frac * 100) + "%";
  const mins = S.flat.filter((l) => isDone(l.id)).reduce((a, l) => a + (l.minutes || 0), 0);
  const days = (S.progress.streak || []).length;
  $("#statsRow").innerHTML = [[done + " / " + total, "lessons done"], [S.chapters.length, "chapters"], [proj.length, "projects"], [mins + " min", "learning time"], [days, days === 1 ? "day of practice" : "days of practice"]]
    .map(([b, s]) => `<div class="stat"><b>${b}</b><span>${s}</span></div>`).join("");
  const last = S.progress.last && S.flat.find((l) => l.id === S.progress.last);
  const target = last && !isDone(last.id) ? last : nxt;
  if (!done && !S.progress.last) { $("#continueBtn").textContent = "Start the first lesson"; $("#continueNote").textContent = "About 5 minutes. No setup needed."; }
  else if (target) { $("#continueBtn").textContent = "Continue: " + target.title; $("#continueNote").textContent = "Lesson " + target.number; }
  else { $("#continueBtn").textContent = "Open the Playground"; $("#continueNote").textContent = "You finished the whole course. 🎉"; }
  $("#continueBtn").onclick = () => (target ? openLesson(target.id) : show("playground"));
}

/* ---------------- hero terminal */
function heroTerm() {
  const lines = [
    ["code", "def gc_content(seq):"],
    ["code", "    seq = seq.upper()"],
    ["code", "    return 100 * (seq.count(\"G\") + seq.count(\"C\")) / len(seq)"],
    ["code", ""],
    ["code", "for name, seq in read_fasta(\"sequences.fasta\").items():"],
    ["code", "    print(f\"{name:<10} {len(seq):>5} bp   GC {gc_content(seq):.1f}%\")"],
    ["out", "lmnA_frag    426 bp   GC 61.0%"],
    ["out", "gfp_like     717 bp   GC 55.9%"],
    ["out", "ampR         861 bp   GC 48.4%"],
    ["out", "lowgc_1      543 bp   GC 33.7%"],
  ];
  const el = $("#heroTerm");
  let i = 0, j = 0, html = "";
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  function paint(cur) { el.innerHTML = html + (cur || "") + '<span class="cursor"></span>'; }
  function hl(code) { return MD.highlight(code); }
  function tick() {
    if (S.page !== "learn") return setTimeout(tick, 600);
    if (i >= lines.length) { setTimeout(() => { i = 0; j = 0; html = ""; tick(); }, 5200); return; }
    const [kind, text] = lines[i];
    if (kind === "out" || reduce) {
      html += kind === "out" ? `<span style="color:var(--ok)">${esc(text)}</span>\n` : `<span class="cm-s-default">${hl(text)}</span>\n`;
      i++; paint(); return setTimeout(tick, kind === "out" ? 260 : 40);
    }
    if (j <= text.length) { paint(`<span class="cm-s-default">${hl(text.slice(0, j))}</span>`); j += 2; return setTimeout(tick, 22); }
    html += `<span class="cm-s-default">${hl(text)}</span>\n`; i++; j = 0;
    if (i < lines.length && lines[i][0] === "out" && lines[i - 1][0] === "code") { html += '<span class="faint">$ python gc_tool.py</span>\n'; }
    paint(); setTimeout(tick, text ? 120 : 60);
  }
  tick();
}

/* ---------------- editors */
function makeEditor(el, opts = {}) {
  return CodeMirror(el, Object.assign({
    mode: "python", lineNumbers: true, indentUnit: 4, tabSize: 4, indentWithTabs: false, matchBrackets: true, autoCloseBrackets: true,
    styleActiveLine: true, viewportMargin: 40, lineWrapping: false,
    extraKeys: {
      Tab: (cm) => (cm.somethingSelected() ? cm.indentSelection("add") : cm.replaceSelection("    ", "end")),
      "Shift-Tab": (cm) => cm.indentSelection("subtract"),
      "Cmd-/": "toggleComment", "Ctrl-/": "toggleComment",
    },
  }, opts));
}
let ed = null;
const pg = { cm: null, refresh() { this.cm && setTimeout(() => this.cm.refresh(), 0); } };
let errMark = { lesson: null, pg: null };
function clearErr(which, cm) { if (errMark[which] != null) { cm.removeLineClass(errMark[which], "background", "err-line"); errMark[which] = null; } }

/* ---------------- lesson */
function openLesson(id, push = true) {
  const l = S.flat.find((x) => x.id === id);
  if (!l) return;
  S.lesson = l;
  const ch = S.chapters.find((c) => c.id === l.chapter);
  l._kind = ch.kind;
  $("#tabLesson").disabled = false;
  $("#crumb").innerHTML = `${ch.kind === "projects" ? "Projects" : "Chapter " + ch.number} · <b>${esc(ch.title)}</b>`;
  $("#stepper").innerHTML = ch.lessons.map((x) => `<button data-l="${x.id}" title="${esc(x.number + " " + x.title)}" class="${x.id === id ? "on" : ""} ${isDone(x.id) ? "done" : ""}"></button>`).join("");
  $$("#stepper button").forEach((b) => (b.onclick = () => openLesson(b.dataset.l)));
  const idx = S.flat.indexOf(l);
  $("#prevBtn").disabled = idx <= 0;
  $("#nextBtn").disabled = idx >= S.flat.length - 1;
  $("#prevBtn").onclick = () => openLesson(S.flat[idx - 1].id);
  $("#nextBtn").onclick = () => openLesson(S.flat[idx + 1].id);
  $("#lNum").textContent = (ch.kind === "projects" ? "Project " + l.number.split(".")[1] : "Lesson " + l.number);
  $("#lMin").textContent = "· " + l.minutes + " min";
  $("#lDone").classList.toggle("on", isDone(id));
  $("#lTitle").textContent = l.title;
  $("#lText").innerHTML = MD.render(l.text);
  $("#lTask").innerHTML = MD.render(l.task);
  $("#lExampleBox").style.display = l.example ? "" : "none";
  if (l.example) { $("#lExample").innerHTML = `<pre class="cm-s-default">${MD.highlight(l.example)}</pre>`; }
  $("#exOut").className = "ex-out"; $("#exOut").innerHTML = "";
  renderHints();
  $("#solution").classList.remove("on"); $("#solution").innerHTML = "";
  $("#solBtn").textContent = "Show solution";
  $("#edName").textContent = l.id + ".py";
  const code = S.progress.code[id] != null ? S.progress.code[id] : (l.starter || "");
  ed.setValue(code); ed.clearHistory(); clearErr("lesson", ed);
  setDirty(false);
  $("#verdict").className = "verdict";
  $("#console").innerHTML = '<span class="faint">Press ▶ Run to see what your code prints, or ✓ Check when you think you\'ve solved the task.</span>';
  $("#vars").innerHTML = ""; $("#plots").innerHTML = ""; $("#varCount").textContent = ""; $("#plotCount").textContent = ""; $("#runtime").textContent = "";
  outTab("lesson", "output");
  S.last.lesson = null;
  show("lesson", push);
  api("/api/progress", { last: id }).then((p) => (S.progress = p)).catch(() => {});
  setTimeout(() => { ed.refresh(); ed.focus(); ed.setCursor(ed.lineCount(), 0); }, 30);
}
function renderHints() {
  const l = S.lesson, n = Math.min(S.progress.hints[l.id] || 0, l.hints.length);
  $("#hints").innerHTML = l.hints.slice(0, n).map((h, i) => `<div class="hint"><b>Hint ${i + 1}${l.hints.length > 1 ? " of " + l.hints.length : ""}</b><div class="md">${MD.render(h)}</div></div>`).join("");
  $("#hintBtn").disabled = !l.hints.length || n >= l.hints.length;
  $("#hintBtn").textContent = !l.hints.length ? "No hints" : n >= l.hints.length ? "All hints shown" : n ? "💡 Another hint" : "💡 Hint";
}
$("#hintBtn").onclick = () => {
  const l = S.lesson; const n = (S.progress.hints[l.id] || 0) + 1;
  S.progress.hints[l.id] = n; renderHints();
  api("/api/progress", { hints: { [l.id]: n } }).catch(() => {});
};
$("#solBtn").onclick = () => {
  const box = $("#solution"), l = S.lesson;
  if (box.classList.contains("on")) { box.classList.remove("on"); $("#solBtn").textContent = "Show solution"; return; }
  if (!isDone(l.id) && !confirm("Look at the solution? Trying a little longer (or a hint) usually teaches more — but it's your call.")) return;
  box.innerHTML = `<div class="codeblock"><pre class="cm-s-default">${MD.highlight(l.solution)}</pre></div>
    <div class="row"><button class="btn sm" id="solCopy">Put the solution in the editor</button></div>
    ${l.explain ? `<div class="md" style="margin-top:12px">${MD.render(l.explain)}</div>` : ""}`;
  box.classList.add("on"); $("#solBtn").textContent = "Hide solution";
  $("#solCopy").onclick = () => { if (ed.getValue().trim() && !confirm("Replace the code in the editor with the solution?")) return; ed.setValue(l.solution); };
};
$("#resetBtn").onclick = () => { if (!confirm("Start again from the starter code? Your current code will be replaced.")) return; ed.setValue(S.lesson.starter || ""); ed.focus(); };
$("#exCopy").onclick = () => {
  if (ed.getValue().trim() && ed.getValue().trim() !== (S.lesson.starter || "").trim() && !confirm("Replace the code in the editor with the example?")) return;
  ed.setValue(S.lesson.example); ed.focus(); toast("Example copied into the editor");
};
$("#exRun").onclick = async () => {
  const b = $("#exRun"); b.classList.add("busy");
  try { inlineResult($("#exOut"), await api("/api/run", { code: S.lesson.example })); }
  catch (e) { inlineResult($("#exOut"), { ok: false, error: { type: "Error", message: e.message } }); }
  b.classList.remove("busy");
};
function inlineResult(box, r) {
  let h = esc(r.output || "");
  if (!r.ok && r.error) h += `<span class="tb">${esc((r.error.traceback || r.error.type + ": " + r.error.message))}</span>`;
  if (!h.trim() && !(r.figures || []).length) h = '<span class="faint">(nothing printed)</span>';
  h += (r.figures || []).map((f) => `<img src="${f}" alt="figure">`).join("");
  box.innerHTML = h; box.className = "ex-out on" + (r.ok ? "" : " bad");
}
// Try-it buttons inside lesson text run the snippet in place; in the cheat sheet they open the Playground
document.addEventListener("click", async (e) => {
  const b = e.target.closest(".try");
  if (!b) return;
  const code = (window.__mdCode || {})[b.dataset.code] || "";
  if (b.closest("#cheats")) { pg.cm.setValue(code); show("playground"); toast("Snippet opened in the Playground — press Run"); return; }
  const block = b.closest(".codeblock");
  let out = block.querySelector(".ex-out");
  if (!out) { out = document.createElement("pre"); out.className = "ex-out"; block.appendChild(out); }
  b.textContent = "Running…";
  try { inlineResult(out, await api("/api/run", { code })); } catch (err) { inlineResult(out, { ok: false, error: { type: "Error", message: err.message } }); }
  b.textContent = "Run again";
});

let saveT = null;
function setDirty(d) { $("#workbench .ed-file .dot").classList.toggle("dirty", d); }
function scheduleSave() {
  setDirty(true);
  clearTimeout(saveT);
  const id = S.lesson && S.lesson.id, code = ed.getValue();
  saveT = setTimeout(() => {
    if (!id) return;
    S.progress.code[id] = code;
    api("/api/progress", { code: { [id]: code } }).then(() => setDirty(false)).catch(() => {});
  }, 700);
}

async function runLesson(mode) {
  if (!S.lesson) return;
  const btn = mode === "check" ? $("#checkBtn") : $("#runBtn");
  btn.classList.add("busy"); $("#runBtn").disabled = $("#checkBtn").disabled = true;
  clearErr("lesson", ed);
  const id = S.lesson.id, wasDone = isDone(id);
  try {
    const r = await api("/api/run", { code: ed.getValue(), lesson: id, mode });
    S.progress.code[id] = ed.getValue(); setDirty(false);
    S.last.lesson = r;
    showResult("lesson", r, mode);
    if (r.progress) {
      S.progress = r.progress;
      if (!wasDone) celebrate(btn);
      renderMap();
      $("#lDone").classList.add("on");
      $$("#stepper button").forEach((b) => b.classList.toggle("done", isDone(b.dataset.l)));
    }
  } catch (e) {
    showResult("lesson", { ok: false, output: "", error: { type: "Error", message: e.message } }, mode);
  }
  btn.classList.remove("busy"); $("#runBtn").disabled = $("#checkBtn").disabled = false;
}
$("#runBtn").onclick = () => runLesson("run");
$("#checkBtn").onclick = () => runLesson("check");

function outTab(which, name) {
  const tabs = which === "lesson" ? "#outTabs" : "#pgOutTabs", pre = which === "lesson" ? "o-" : "pg-";
  $$(tabs + " button").forEach((b) => b.classList.toggle("on", b.dataset.o === name));
  $$((which === "lesson" ? "#workbench" : "#p-playground") + " .out-panel").forEach((p) => p.classList.toggle("on", p.id === pre + name));
}
$$("#outTabs button").forEach((b) => (b.onclick = () => outTab("lesson", b.dataset.o)));
$$("#pgOutTabs button").forEach((b) => (b.onclick = () => outTab("pg", b.dataset.o)));

function showResult(which, r, mode) {
  const L = which === "lesson";
  const cm = L ? ed : pg.cm;
  const con = L ? $("#console") : $("#pgConsole");
  let h = esc(r.output || "");
  if (!r.ok && r.error) h += (h && !h.endsWith("\n") ? "\n" : "") + `<span class="tb">${esc(r.error.traceback || (r.error.type + ": " + r.error.message))}</span>`;
  if (!h.trim()) h = '<span class="faint">(Your code ran but printed nothing. Use print(…) to see values.)</span>';
  con.innerHTML = h;
  const vars = r.variables || [];
  (L ? $("#vars") : $("#pgVars")).innerHTML = vars.length
    ? `<table><tr><th>Name</th><th>Type</th><th>Size</th><th>Value</th></tr>${vars.map((v) => `<tr><td class="n">${esc(v.name)}</td><td class="t">${esc(v.type)}</td><td class="t">${v.size ?? ""}</td><td class="v">${esc(v.value)}</td></tr>`).join("")}</table>`
    : '<div class="empty">No variables yet. Variables you create (like <code>seq = "ATG"</code>) show up here after a run.</div>';
  (L ? $("#varCount") : $("#pgVarCount")).textContent = vars.length || "";
  const figs = r.figures || [];
  (L ? $("#plots") : $("#pgPlots")).innerHTML = figs.length ? figs.map((f) => `<img src="${f}" alt="figure">`).join("") : '<div class="empty">Figures you draw with matplotlib appear here.</div>';
  (L ? $("#plotCount") : $("#pgPlotCount")).textContent = figs.length || "";
  (L ? $("#runtime") : $("#pgRuntime")).textContent = r.elapsed != null ? r.elapsed.toFixed(2) + " s" : "";
  outTab(L ? "lesson" : "pg", figs.length && r.ok && mode !== "check" ? "plots" : "output");
  if (r.error && r.error.line) {
    const ln = r.error.line - 1;
    if (ln >= 0 && ln < cm.lineCount()) { cm.addLineClass(ln, "background", "err-line"); errMark[L ? "lesson" : "pg"] = ln; }
  }
  if (!L) return;
  const v = $("#verdict");
  if (!r.ok && r.error) {
    v.className = "verdict on error";
    v.innerHTML = `<div class="v-ico">!</div><div class="v-body"><div class="v-title">${esc(r.error.type)}${r.error.line ? " on line " + r.error.line : ""}: ${esc(r.error.message)}</div>
      ${r.error.friendly ? `<div class="v-friendly">${esc(r.error.friendly)}</div>` : ""}
      <div class="v-actions"><button class="btn sm" data-act="tutor">✦ Explain this error</button></div></div>`;
  } else if (mode === "check" && r.check) {
    const m = (r.check.messages || []).join(" ");
    if (r.check.passed) {
      const idx = S.flat.indexOf(S.lesson), next = S.flat[idx + 1];
      v.className = "verdict on pass";
      v.innerHTML = `<div class="v-ico">✓</div><div class="v-body"><div class="v-title">Correct!</div><div class="v-friendly">${esc(m)}</div>
        <div class="v-actions">${next ? `<button class="btn sm primary" data-act="next">Next: ${esc(next.title)} →</button>` : '<button class="btn sm primary" data-act="map">Back to the course</button>'}</div></div>`;
    } else {
      v.className = "verdict on fail";
      v.innerHTML = `<div class="v-ico">…</div><div class="v-body"><div class="v-title">Not quite yet</div><div class="v-friendly">${esc(m)}</div>
        <div class="v-actions">${S.lesson.hints.length && (S.progress.hints[S.lesson.id] || 0) < S.lesson.hints.length ? '<button class="btn sm" data-act="hint">💡 Show a hint</button>' : ""}<button class="btn sm" data-act="tutor">✦ Ask the tutor</button></div></div>`;
    }
  } else {
    v.className = "verdict";
  }
}
$("#verdict").addEventListener("click", (e) => {
  const a = e.target.closest("[data-act]"); if (!a) return;
  if (a.dataset.act === "next") { const i = S.flat.indexOf(S.lesson); openLesson(S.flat[i + 1].id); }
  if (a.dataset.act === "map") show("learn");
  if (a.dataset.act === "hint") { $("#hintBtn").click(); $("#hints").lastElementChild?.scrollIntoView({ behavior: "smooth", block: "center" }); }
  if (a.dataset.act === "tutor") openTutor("lesson", a.textContent.includes("error") ? "Explain this error in simple words and tell me what to look at." : "Why doesn't my code pass the check? Give me a hint, not the solution.");
});

function celebrate(from) {
  const box = $("#burst"), r = from.getBoundingClientRect();
  const cols = { A: "#34c759", T: "#ff453a", G: "#ff9f0a", C: "#0a84ff" };
  box.innerHTML = "";
  for (let i = 0; i < 34; i++) {
    const b = "ATGC"[i % 4], el = document.createElement("i");
    el.textContent = Math.random() < .2 ? ["✓", "{ }", "def", "≫"][i % 4] : b;
    el.style.left = r.left + r.width / 2 + "px"; el.style.top = r.top + r.height / 2 + "px"; el.style.color = cols[b];
    const a = Math.random() * Math.PI * 2, d = 90 + Math.random() * 220;
    el.style.setProperty("--dx", Math.cos(a) * d + "px"); el.style.setProperty("--dy", Math.sin(a) * d - 60 + "px"); el.style.setProperty("--r", (Math.random() * 360 - 180) + "deg");
    el.style.animationDelay = Math.random() * 0.12 + "s";
    box.appendChild(el);
  }
  setTimeout(() => (box.innerHTML = ""), 1700);
}

/* ---------------- playground */
const SNIPPETS = [
  ["Read a FASTA file", 'def read_fasta(path):\n    """Return {name: sequence} for every record in a FASTA file."""\n    seqs, name = {}, None\n    with open(path) as f:\n        for line in f:\n            line = line.strip()\n            if line.startswith(">"):\n                name = line[1:].split()[0]\n                seqs[name] = ""\n            elif name:\n                seqs[name] += line.upper()\n    return seqs\n\n\nfor name, seq in read_fasta("sequences.fasta").items():\n    gc = 100 * (seq.count("G") + seq.count("C")) / len(seq)\n    print(f"{name:<10} {len(seq):>5} bp  GC {gc:.1f}%")\n'],
  ["Reverse complement", 'seq = "ATGGCCATTGTAATGGGCCGC"\ncomplement = str.maketrans("ACGTacgt", "TGCAtgca")\nprint(seq.translate(complement)[::-1])\n'],
  ["Look at a CSV with pandas", 'import pandas as pd\n\ndf = pd.read_csv("qpcr.csv")\nprint(df.head())\nprint()\nprint(df.groupby(["condition", "gene"])["ct"].mean().round(2))\n'],
  ["Plot a growth curve", 'import pandas as pd\nimport matplotlib.pyplot as plt\n\ndf = pd.read_csv("growth_curve.csv")\nfor strain in ["WT", "delta_recA", "delta_lon"]:\n    plt.plot(df["time_min"], df[strain], marker="o", ms=3, label=strain)\nplt.yscale("log")\nplt.xlabel("Time (min)")\nplt.ylabel("OD600")\nplt.legend()\nplt.title("Growth curves")\nplt.show()\n'],
  ["Volcano plot", 'import numpy as np\nimport pandas as pd\nimport matplotlib.pyplot as plt\n\ndf = pd.read_csv("expression.csv")\ndf["neglog10p"] = -np.log10(df["p_value"])\nsig = (df["p_value"] < 0.05) & (df["log2_fold_change"].abs() > 1)\nplt.scatter(df["log2_fold_change"], df["neglog10p"], c=np.where(sig, "crimson", "grey"), s=14)\nfor _, r in df[sig].iterrows():\n    plt.annotate(r["gene"], (r["log2_fold_change"], r["neglog10p"]), fontsize=7)\nplt.xlabel("log2 fold change")\nplt.ylabel("-log10 p")\nplt.show()\n'],
  ["Ask the user for input", 'name = input("Primer name? ")\nseq = input("Sequence? ").upper()\nprint(f"{name}: {len(seq)} nt, GC {100 * (seq.count(\'G\') + seq.count(\'C\')) / len(seq):.0f}%")\n# Type the answers in the Input tab below, one per line.\n'],
];
$("#pgSnippets").innerHTML += SNIPPETS.map((s, i) => `<option value="${i}">${esc(s[0])}</option>`).join("");
$("#pgSnippets").onchange = (e) => {
  const i = e.target.value; if (i === "") return;
  if (pg.cm.getValue().trim() && !confirm("Replace the Playground code with this snippet?")) { e.target.value = ""; return; }
  pg.cm.setValue(SNIPPETS[i][1]); e.target.value = ""; pg.cm.focus();
};
$("#pgClear").onclick = () => { if (pg.cm.getValue().trim() && !confirm("Clear the Playground?")) return; pg.cm.setValue(""); pg.cm.focus(); };
let pgSaveT = null;
async function runPg() {
  const b = $("#pgRun"); b.classList.add("busy"); clearErr("pg", pg.cm);
  try {
    const r = await api("/api/run", { code: pg.cm.getValue(), stdin: $("#pgStdin").value, mode: "playground" });
    S.last.pg = r; showResult("pg", r);
    loadFiles();
  } catch (e) { showResult("pg", { ok: false, error: { type: "Error", message: e.message } }); }
  b.classList.remove("busy");
}
$("#pgRun").onclick = runPg;
async function loadFiles() {
  try {
    const { files } = await api("/api/files");
    const kb = (n) => n < 1024 ? n + " B" : n < 1048576 ? (n / 1024).toFixed(1) + " KB" : (n / 1048576).toFixed(1) + " MB";
    $("#files").innerHTML = files.map((f) => `<div class="file ${f.example ? "" : "mine"}" data-f="${esc(f.name)}" title="${f.example ? "Example file" : "Your file"} — click to preview">
      <span class="f-ico">${esc((f.name.split(".").pop() || "").slice(0, 5))}</span><span class="f-name">${esc(f.name)}</span><span class="f-size">${kb(f.size)}</span>
      <button class="f-x" title="${f.example ? "Restore the original" : "Delete"}">${f.example ? "↺" : "✕"}</button></div>`).join("");
  } catch (e) { $("#files").innerHTML = `<p class="muted small">${esc(e.message)}</p>`; }
}
$("#files").addEventListener("click", async (e) => {
  const row = e.target.closest(".file"); if (!row) return;
  const name = row.dataset.f;
  if (e.target.closest(".f-x")) {
    const example = !row.classList.contains("mine");
    if (!confirm(example ? `Restore ${name} to the original example file?` : `Delete ${name}?`)) return;
    await api(example ? "/api/files/restore" : "/api/files/delete", { name }).catch((er) => toast(er.message));
    toast(example ? "Restored " + name : "Deleted " + name); return loadFiles();
  }
  try {
    const r = await api("/api/file?name=" + encodeURIComponent(name));
    $("#fpName").textContent = name; $("#fpText").textContent = r.text.split("\n").slice(0, 400).join("\n");
    $("#filePreview").classList.add("on"); $("#filePreview").dataset.f = name;
    $("#filePreview").scrollIntoView({ behavior: "smooth", block: "nearest" });
  } catch (er) { toast(er.message); }
});
$("#fpClose").onclick = () => $("#filePreview").classList.remove("on");
$("#fpInsert").onclick = () => {
  const n = $("#filePreview").dataset.f, ext = n.split(".").pop().toLowerCase();
  const code = ext === "csv" ? `import pandas as pd\n\ndf = pd.read_csv("${n}")\nprint(df.head())\n`
    : ext === "fasta" || ext === "fa" ? `with open("${n}") as f:\n    for line in f:\n        line = line.strip()\n        if line.startswith(">"):\n            print("Record:", line[1:])\n`
    : `with open("${n}") as f:\n    for number, line in enumerate(f, start=1):\n        print(number, line.rstrip())\n`;
  const doc = pg.cm.getDoc(); doc.replaceRange((pg.cm.getValue().trim() ? "\n" : "") + code, { line: doc.lastLine() + 1, ch: 0 }); pg.cm.focus();
};
$("#revealBtn").onclick = () => api("/api/files/reveal", {}).catch((e) => toast(e.message));
async function upload(files) {
  for (const f of files) {
    try { await api("/api/files/upload?name=" + encodeURIComponent(f.name), await f.arrayBuffer(), true); toast("Added " + f.name); }
    catch (e) { toast(f.name + ": " + e.message, 4000); }
  }
  loadFiles();
}
const drop = $("#drop");
["dragenter", "dragover"].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add("over"); }));
["dragleave", "drop"].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.remove("over"); }));
drop.addEventListener("drop", (e) => upload([...e.dataTransfer.files]));
$("#browse").onclick = (e) => { e.preventDefault(); $("#fileInput").click(); };
$("#fileInput").onchange = (e) => { upload([...e.target.files]); e.target.value = ""; };
window.addEventListener("dragover", (e) => e.preventDefault());
window.addEventListener("drop", (e) => e.preventDefault());

/* ---------------- tutor */
const T = { history: [], src: "lesson", status: null };
async function tutorStatus(refresh) {
  try { T.status = await api("/api/tutor/status" + (refresh ? "?refresh=1" : "")); } catch (e) { T.status = { found: false, logged_in: false }; }
  const box = $("#drSetup");
  if (T.status.found && T.status.logged_in) { box.classList.remove("on"); return true; }
  box.classList.add("on");
  box.innerHTML = `<div class="msg bot"><div class="md"><p><b>The tutor uses Claude Code</b>, signed in with your own Claude plan (no API key). ${T.status.found ? "Claude Code is installed but not signed in." : "Claude Code isn't installed yet."}</p>
    <p>Press the button, finish the steps in the Terminal window that opens, then press <b>Check again</b>.</p></div>
    <div class="row"><button class="btn sm primary" id="tSetup">${T.status.found ? "Sign in to Claude" : "Install and sign in"}</button><button class="btn sm" id="tRecheck">Check again</button></div></div>`;
  $("#tSetup").onclick = () => api("/api/tutor/setup", {}).catch((e) => toast(e.message));
  $("#tRecheck").onclick = () => tutorStatus(true);
  return false;
}
function openTutor(src, question) {
  T.src = src;
  const ctx = src === "lesson" && S.lesson ? "about " + S.lesson.number + " " + S.lesson.title : "about your Playground code";
  $("#drCtx").textContent = ctx;
  $("#drawer").classList.add("on"); $("#drawer").setAttribute("aria-hidden", "false");
  if (!T.history.length) $("#drBody").innerHTML = `<div class="msg bot"><div class="md"><p>Hi! I can see your code and what it printed. Ask me anything — why something fails, what a line does, or how to approach the task. I'll give hints rather than the answer unless you ask.</p></div></div>`;
  tutorStatus(false).then((ready) => { if (ready && question) ask(question); });
  if (!question) setTimeout(() => $("#drInput").focus(), 300);
}
function tutorContext() {
  if (T.src === "lesson" && S.lesson) {
    const r = S.last.lesson || {};
    return { lesson: S.lesson.number + " " + S.lesson.title, task: S.lesson.task, code: ed.getValue(), output: r.output || "",
      error: r.error ? (r.error.traceback || r.error.type + ": " + r.error.message) : "", check: r.check ? (r.check.passed ? "passed" : (r.check.messages || []).join(" ")) : "", history: T.history };
  }
  const r = S.last.pg || {};
  return { lesson: "Playground (free coding)", code: pg.cm.getValue(), output: r.output || "", error: r.error ? (r.error.traceback || r.error.message) : "", history: T.history };
}
async function ask(q) {
  q = (q || "").trim(); if (!q) return;
  const body = $("#drBody");
  body.insertAdjacentHTML("beforeend", `<div class="msg user">${esc(q)}</div><div class="msg bot typing" id="typing"><span></span><span></span><span></span></div>`);
  body.scrollTop = body.scrollHeight;
  $("#drSend").disabled = true;
  try {
    const { answer } = await api("/api/tutor/ask", { question: q, context: tutorContext() });
    T.history.push({ role: "learner", text: q }, { role: "tutor", text: answer });
    $("#typing").outerHTML = `<div class="msg bot"><div class="md">${MD.render(answer)}</div></div>`;
  } catch (e) {
    $("#typing").outerHTML = `<div class="msg bot err">${esc(e.message)}</div>`;
    tutorStatus(false);
  }
  $("#drSend").disabled = false;
  body.scrollTop = body.scrollHeight;
}
$("#tutorBtn").onclick = () => openTutor("lesson");
$("#pgTutor").onclick = () => openTutor("pg");
$("#drClose").onclick = () => { $("#drawer").classList.remove("on"); $("#drawer").setAttribute("aria-hidden", "true"); };
$("#drForm").onsubmit = (e) => { e.preventDefault(); const v = $("#drInput").value; $("#drInput").value = ""; ask(v); };
$("#drInput").addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); $("#drForm").requestSubmit(); } });
$$("#drQuick button").forEach((b) => (b.onclick = () => tutorStatus(false).then((ok) => ok && ask(b.dataset.q))));
document.addEventListener("keydown", (e) => { if (e.key === "Escape") $("#drClose").click(); });

/* ---------------- start */
async function init() {
  ed = makeEditor($("#editor"), {
    extraKeys: Object.assign(makeEditor.keys || {}, {
      "Cmd-Enter": () => runLesson("run"), "Ctrl-Enter": () => runLesson("run"),
      "Shift-Cmd-Enter": () => runLesson("check"), "Shift-Ctrl-Enter": () => runLesson("check"),
      Tab: (cm) => (cm.somethingSelected() ? cm.indentSelection("add") : cm.replaceSelection("    ", "end")),
      "Shift-Tab": (cm) => cm.indentSelection("subtract"), "Cmd-/": "toggleComment", "Ctrl-/": "toggleComment",
      "Cmd-S": () => toast("Your code saves automatically"), "Ctrl-S": () => toast("Your code saves automatically"),
    }),
  });
  ed.on("change", (cm, ch) => { if (ch.origin !== "setValue") { scheduleSave(); clearErr("lesson", ed); } });
  pg.cm = makeEditor($("#pgEditor"), {
    extraKeys: {
      "Cmd-Enter": runPg, "Ctrl-Enter": runPg,
      Tab: (cm) => (cm.somethingSelected() ? cm.indentSelection("add") : cm.replaceSelection("    ", "end")),
      "Shift-Tab": (cm) => cm.indentSelection("subtract"), "Cmd-/": "toggleComment", "Ctrl-/": "toggleComment",
      "Cmd-S": () => toast("The Playground saves automatically"), "Ctrl-S": () => toast("The Playground saves automatically"),
    },
  });
  pg.cm.on("change", () => { clearErr("pg", pg.cm); clearTimeout(pgSaveT); pgSaveT = setTimeout(() => api("/api/progress", { playground: pg.cm.getValue() }).catch(() => {}), 800); });
  try {
    const [st, course, prog] = await Promise.all([api("/api/state"), api("/api/course"), api("/api/progress")]);
    $("#ver").textContent = st.version;
    S.chapters = course.chapters; S.progress = prog;
    S.flat = S.chapters.flatMap((c) => c.lessons);
    $("#cheats").innerHTML = MD.render(course.reference || "*The cheat sheet is being written.*");
    pg.cm.setValue(prog.playground || "# Your own space to experiment.\n# Example files (sequences.fasta, qpcr.csv, …) are listed on the right.\n\nprint(\"Hello from the Playground!\")\n");
    renderMap();
    heroTerm();
    route();
  } catch (e) {
    $("#chapters").innerHTML = `<div class="card"><b>Could not load the course.</b><p class="muted">${esc(e.message)}</p></div>`;
  }
}
init();
