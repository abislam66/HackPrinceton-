// First-pass composition audit of a live page. See ../SKILL.md. Requires Playwright (resolved from cwd, or --pw <dir>).
import { createRequire } from 'node:module';
import path from 'node:path';
const a = process.argv.slice(2), url = a[0];
const opt = (k, d) => { const i = a.indexOf('--' + k); return i > 0 ? a[i + 1] : d; };
if (!url) { console.log('usage: node measure.mjs <url> [--width 1440] [--cols 12] [--margin 20] [--gutter 20] [--tol 2] [--pw dir]'); process.exit(1); }
const W = +opt('width', 1440), cols = +opt('cols', W < 700 ? 4 : 12), margin = +opt('margin', 20), gutter = +opt('gutter', 20), tol = +opt('tol', 2);
const pwDir = opt('pw', process.cwd());
const { chromium } = createRequire(path.join(path.resolve(pwDir), 'x.js'))('playwright');
const colW = (W - 2 * margin - (cols - 1) * gutter) / cols;
const starts = Array.from({ length: cols }, (_, i) => margin + i * (colW + gutter));
const scale = [0, 4, 8, 12, 16, 24, 32, 48, 64, 96, 128, 160, 224].map((v) => v * W / 1440);
const br = await chromium.launch();
const pg = await br.newPage({ viewport: { width: W, height: 900 } });
await pg.goto(url, { waitUntil: 'load', timeout: 60000 });
await pg.waitForTimeout(3000);
const data = await pg.evaluate(() => {
  const out = [], vis = (e) => { const s = getComputedStyle(e), r = e.getBoundingClientRect(); return s.visibility !== 'hidden' && s.display !== 'none' && +s.opacity > 0.05 && r.width > 0 && r.height > 0; };
  const secOf = (e) => { let n = e; while (n && n.parentElement && !/^(SECTION|FOOTER|HEADER)$/.test(n.tagName)) n = n.parentElement; return n && /^(SECTION|FOOTER|HEADER)$/.test(n.tagName) ? (n.id || n.className || n.tagName).toString().slice(0, 30) : 'page'; };
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const seen = new Set();
  while (walker.nextNode()) {
    const t = walker.currentNode, txt = t.textContent.trim(), e = t.parentElement;
    if (!txt || !e || /^(SCRIPT|STYLE|NOSCRIPT)$/.test(e.tagName) || !vis(e) || seen.has(e)) continue;
    seen.add(e);
    const r = document.createRange(); r.selectNodeContents(t);
    const rects = [...r.getClientRects()].filter((q) => q.width > 1);
    if (!rects.length) continue;
    const l0 = Math.min(...rects.map((q) => q.left)); if (l0 < -1 || l0 > innerWidth - 2) continue;   // off screen (closed menus, drawers)
    const key = txt + Math.round(l0) + Math.round(rects[0].top); if (seen.has(key)) continue; seen.add(key);
    const s = getComputedStyle(e), lines = new Set(rects.map((q) => Math.round(q.top))).size;
    out.push({ txt: txt.slice(0, 40), left: Math.min(...rects.map((q) => q.left)), top: rects[0].top + scrollY, fs: parseFloat(s.fontSize), lh: s.lineHeight === 'normal' ? NaN : parseFloat(s.lineHeight), align: s.textAlign, sec: secOf(e), len: txt.length, lines, mt: s.marginTop, pt: s.paddingTop, pb: s.paddingBottom, mb: s.marginBottom, gap: s.rowGap });
  }
  return out;
});
await br.close();
const near = (x) => Math.min(...starts.map((s) => Math.abs(s - x)));
const R = (n) => Math.round(n * 10) / 10;
console.log(`W=${W} cols=${cols} col=${R(colW)} starts=${starts.map(R).join(', ')}\n`);
const off = data.filter((d) => near(d.left) > tol);
console.log(`Rule 1: ${off.length}/${data.length} text blocks off a column line (> ${tol}px)`);
off.slice(0, 25).forEach((d) => console.log(`  x=${R(d.left)} (off ${R(near(d.left))}) "${d.txt}" [${d.sec}]`));
const bySec = {}; data.forEach((d) => (bySec[d.sec] = bySec[d.sec] || []).push(d));
const firsts = Object.entries(bySec).map(([k, v]) => [k, R(v.sort((p, q) => p.top - q.top)[0].left)]);
const edges = [...new Set(firsts.map((f) => f[1]))];
console.log(`\nRules 2 and 3: ${edges.length} distinct section-start edges (limit 2): ${edges.join(', ')}`);
Object.entries(bySec).forEach(([k, v]) => { const e = [...new Set(v.map((d) => Math.round(d.left / (tol + 1))))].length; if (e > 3) console.log(`  ${k}: ~${e} left edges (limit 3)`); });
const sizes = [...new Set(data.map((d) => R(d.fs)))].sort((x, y) => x - y);
console.log(`\nRule 8: ${sizes.length} font sizes (limit 7): ${sizes.join(', ')}`);
const badLh = data.filter((d) => !isNaN(d.lh) && Math.abs(d.lh / (W / 1440) % 4) > 0.6 && Math.abs(d.lh / (W / 1440) % 4 - 4) > 0.6);
console.log(`Rule 9: ${badLh.length} blocks with line height off the 4px multiple`);
badLh.slice(0, 8).forEach((d) => console.log(`  lh=${R(d.lh)} fs=${R(d.fs)} "${d.txt}"`));
const body = data.filter((d) => d.len > 120 && d.lines > 1);
console.log(`\nRule 7: body measure (chars per line, target 45 to 75 desktop, 30 to 45 phone)`);
body.slice(0, 15).forEach((d) => { const c = Math.round(d.len / d.lines); console.log(`  ${c}${(W >= 700 ? c < 40 || c > 80 : c < 25 || c > 50) ? '  OUT' : ''} "${d.txt}"`); });
const stray = new Map();
data.forEach((d) => [d.mt, d.mb, d.pt, d.pb, d.gap].forEach((v) => { const n = parseFloat(v); if (n && !scale.some((s) => Math.abs(s - n) < 0.6)) stray.set(R(n), (stray.get(R(n)) || 0) + 1); }));
console.log(`\nRule 11: spacing values off the scale (seen on text elements only): ${[...stray.entries()].map(([k, c]) => `${k}px x${c}`).join(', ') || 'none'}`);
const ctr = data.filter((d) => d.align === 'center' && d.len > 60);
console.log(`Rule 21: ${ctr.length} centered long text blocks`);
ctr.slice(0, 8).forEach((d) => console.log(`  "${d.txt}" [${d.sec}]`));
