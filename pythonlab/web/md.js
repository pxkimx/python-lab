/* A small Markdown renderer for lesson text: headings, paragraphs, **bold**, *italic*, `code`,
   ```python blocks (highlighted, with a Try it button), - and 1. lists, > callouts and | tables |. */
(function () {
  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  function inline(s) {
    const codes = [];
    s = s.replace(/`([^`]+)`/g, (_, c) => { codes.push(c); return "\u0000" + (codes.length - 1) + "\u0000"; });
    s = esc(s)
      .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>")
      .replace(/(^|[^*\w])\*([^*\s][^*]*)\*(?!\w)/g, "$1<i>$2</i>")
      .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    return s.replace(/\u0000(\d+)\u0000/g, (_, i) => "<code>" + esc(codes[+i]) + "</code>");
  }

  function highlight(code) {
    if (window.CodeMirror && CodeMirror.runMode) {
      const el = document.createElement("div");
      CodeMirror.runMode(code, "python", el);
      return el.innerHTML;
    }
    return esc(code);
  }

  function codeBlock(code, lang) {
    const id = "cb" + Math.random().toString(36).slice(2, 9);
    window.__mdCode = window.__mdCode || {};
    window.__mdCode[id] = code;
    const py = !lang || lang === "python" || lang === "py";
    return `<div class="codeblock"><pre class="cm-s-default">${py ? highlight(code) : esc(code)}</pre>` +
      (py ? `<button class="try" data-code="${id}" title="Open this snippet in the editor">Try it</button>` : "") + "</div>";
  }

  function table(rows) {
    const cells = (r) => r.replace(/^\s*\|/, "").replace(/\|\s*$/, "").split("|").map((c) => c.trim());
    const head = cells(rows[0]);
    const body = rows.slice(2).map(cells);
    return '<div class="tbl"><table><thead><tr>' + head.map((h) => `<th>${inline(h)}</th>`).join("") + "</tr></thead><tbody>" +
      body.map((r) => "<tr>" + r.map((c) => `<td>${inline(c)}</td>`).join("") + "</tr>").join("") + "</tbody></table></div>";
  }

  function render(src) {
    const lines = (src || "").replace(/\r/g, "").split("\n");
    let html = "", i = 0;
    while (i < lines.length) {
      const line = lines[i];
      const fence = line.match(/^```(\w*)\s*$/);
      if (fence) {
        const buf = [];
        i++;
        while (i < lines.length && !/^```\s*$/.test(lines[i])) buf.push(lines[i++]);
        i++;
        html += codeBlock(buf.join("\n"), fence[1]);
        continue;
      }
      const h = line.match(/^(#{1,3})\s+(.*)$/);
      if (h) { const n = h[1].length + 1; html += `<h${n}>${inline(h[2])}</h${n}>`; i++; continue; }
      if (/^\s*\|.*\|\s*$/.test(line) && i + 1 < lines.length && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1])) {
        const rows = [];
        while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) rows.push(lines[i++]);
        html += table(rows);
        continue;
      }
      if (/^>\s?/.test(line)) {
        const buf = [];
        while (i < lines.length && /^>\s?/.test(lines[i])) buf.push(lines[i++].replace(/^>\s?/, ""));
        html += `<div class="callout">${render(buf.join("\n"))}</div>`;
        continue;
      }
      if (/^\s*[-*]\s+/.test(line)) {
        const items = [];
        while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
          let t = lines[i++].replace(/^\s*[-*]\s+/, "");
          while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !/^\s*[-*]\s+/.test(lines[i])) t += " " + lines[i++].trim();
          items.push(t);
        }
        html += "<ul>" + items.map((t) => `<li>${inline(t)}</li>`).join("") + "</ul>";
        continue;
      }
      if (/^\s*\d+[.)]\s+/.test(line)) {
        const items = [];
        const start = parseInt(line, 10) || 1;
        while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) {
          let t = lines[i++].replace(/^\s*\d+[.)]\s+/, "");
          while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !/^\s*\d+[.)]\s+/.test(lines[i])) t += " " + lines[i++].trim();
          items.push(t);
        }
        html += `<ol start="${start}">` + items.map((t) => `<li>${inline(t)}</li>`).join("") + "</ol>";
        continue;
      }
      if (!line.trim()) { i++; continue; }
      const buf = [];
      while (i < lines.length && lines[i].trim() && !/^(```|#{1,3}\s|>|\s*[-*]\s+|\s*\d+[.)]\s+)/.test(lines[i]) &&
             !(/^\s*\|.*\|\s*$/.test(lines[i]) && i + 1 < lines.length && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1]))) buf.push(lines[i++]);
      html += `<p>${inline(buf.join(" "))}</p>`;
    }
    return html;
  }

  window.MD = { render, highlight, esc };
})();
