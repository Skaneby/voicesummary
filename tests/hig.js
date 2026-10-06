// HIG-test för Diane — kontrollerar Apples Human Interface Guidelines
// (.claude/rules/apple-hig.md) mätbart, i både mörkt och ljust läge:
//   • träffytor ≥ 44×44 (riktig träfftestning, så utvidgade ytor räknas)
//   • ingen text under 12 px
//   • textkontrast ≥ 4,5:1 mot den faktiska (alfakomponerade) bakgrunden
//   • varje kontroll har ett tillgängligt namn
//   • Reduce Motion stänger av animationerna
// Kör: node tests/hig.js (ingår i npm test)
const { chromium } = require('playwright-core');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };

// Medvetna avvikelser från HIG — HIG-regeln kräver att de flaggas och motiveras
const EXCEPTIONS = {
  // Omformateringsraden är en horisontellt rullbar lista; pillren utanför kanten nås genom att rulla
  offscreenScrollers: ['.reformat-row'],
  // Googles inloggningsknapp ritas av Googles skript (GIS) i en iframe. Största
  // storleken är 40 px hög, och Googles varumärkesregler förbjuder att ändra den.
  thirdParty: ['#googleSignInBtn'],
};

let pass = 0, fail = 0;
function check(name, ok, extra) {
  if (ok) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? ' — ' + extra : '')); }
}

// Körs i sidan: mäter den skärm som visas just nu
function auditInPage(exceptions) {
  const parse = c => {
    const m = c.match(/[\d.]+/g); if (!m) return null; const v = m.map(Number);
    // color(srgb r g b [/ a]) — som color-mix() rapporteras — har kanaler 0–1
    if (c.startsWith('color(')) { const [r, g, b, a] = v; return [r * 255, g * 255, b * 255].concat(a === undefined ? [] : [a]); }
    return v;
  };
  const lum = ([r, g, b]) => [r, g, b].map(v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); })
    .reduce((s, v, i) => s + v * [.2126, .7152, .0722][i], 0);
  const bgOf = el => {
    const stack = [];
    for (let e = el; e; e = e.parentElement) {
      const c = parse(getComputedStyle(e).backgroundColor);
      if (c && (c[3] === undefined || c[3] > 0)) { stack.push(c); if (c[3] === undefined || c[3] === 1) break; }
    }
    let base = parse(getComputedStyle(document.body).backgroundColor).slice(0, 3);
    for (const c of stack.reverse()) { const a = c[3] === undefined ? 1 : c[3]; base = base.map((v, i) => v * (1 - a) + c[i] * a); }
    return base;
  };
  const inView = r => r.width > 0 && r.height > 0 && r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth;
  const inScroller = el => exceptions.offscreenScrollers.some(s => el.closest(s));
  const name = el => (el.id || el.className || el.tagName).toString().slice(0, 30);

  const targets = [], tiny = new Set(), contrast = new Set(), unnamed = [];
  document.querySelectorAll('button, a[href], input, select, textarea, [role=button], label.sw').forEach(el => {
    const r = el.getBoundingClientRect(); const st = getComputedStyle(el);
    if (st.visibility === 'hidden' || !inView(r) || inScroller(el)) return;
    if (exceptions.thirdParty.some(s => el.closest(s))) return;
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const top = document.elementFromPoint(cx, cy);
    if (!top || !(el === top || el.contains(top) || top.contains(el))) return;   // täckt av något annat
    if (el.tagName === 'INPUT' && el.closest('label.sw')) return;                  // mäts via label.sw
    const own = n => n && (n === el || el.contains(n));
    const reach = (dx, dy) => own(document.elementFromPoint(cx + dx, cy + dy));
    const okW = r.width >= 44 || (reach(-21.5, 0) && reach(21.5, 0));
    const okH = r.height >= 44 || (reach(0, -21.5) && reach(0, 21.5));
    if (!okW || !okH) targets.push(name(el) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height));
    // Tillgängligt namn: synlig text, aria-label, title eller kopplad label
    const labelled = (el.innerText || '').trim() || el.getAttribute('aria-label') || el.title ||
      (el.id && document.querySelector('label[for="' + el.id + '"]')) || el.closest('label');
    if (!labelled && el.type !== 'hidden') unnamed.push(name(el));
  });
  document.querySelectorAll('body *').forEach(el => {
    if (![...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) return;
    if (el.closest('[aria-hidden="true"]')) return;
    const r = el.getBoundingClientRect(); const st = getComputedStyle(el);
    if (!r.width || !r.height || st.visibility === 'hidden' || r.bottom < 0 || r.top > innerHeight) return;
    const fs = parseFloat(st.fontSize);
    if (fs < 12) tiny.add(name(el) + ' ' + fs + 'px');
    const a = lum(parse(st.color).slice(0, 3)), b = lum(bgOf(el));
    const cr = (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
    if (cr < 4.5) contrast.add(name(el) + ' ' + cr.toFixed(2) + ':1 "' + el.textContent.trim().slice(0, 20) + '"');
  });
  return { targets, tiny: [...tiny], contrast: [...contrast], unnamed };
}

const SCREENS = {
  'start': () => show('idle'),
  'inspelning, pausad': () => { show('recording'); s.mediaRecorder = { state: 'recording', pause() {}, resume() {} }; s.paused = false; s.start = Date.now(); s.elapsed = 0; togglePause(); },
  'resultat, protokoll': () => { s.mediaRecorder = null; s.paused = false; showResult('<article><section><h2>Beslut</h2><p>Vi lanserar på fredag.</p><ul><li><strong>Ansvar:</strong> Johan</li></ul></section></article>', 'protocol'); },
  'resultat, satir': () => showResult('<article><section><h2>Exekutiv sammanfattning</h2><p>Synergier.</p></section></article>', 'floskel'),
  'betalvägg': () => show('paywall'),
  'inloggning': () => show('signin'),
  'fel': () => showError('Nätverksfel — försök igen.', true),
  'inställningar': () => { show('idle'); openSettings(); },
  'historik': () => { closeSettings(); saveToHistory('<article><p>x</p></article>', 'Veckomöte'); openHistory(); },
  'formathjälp': () => { closeHistory(); openFormatHelp(); },
};

(async () => {
  const server = http.createServer((req, res) => {
    const file = path.join(ROOT, req.url === '/' ? 'index.html' : req.url.split('?')[0]);
    try { res.setHeader('Content-Type', MIME[path.extname(file)] || 'application/octet-stream'); res.end(fs.readFileSync(file)); }
    catch { res.statusCode = 404; res.end('not found'); }
  }).listen(0);
  const base = 'http://127.0.0.1:' + server.address().port;
  const chromePath = process.env.PW_CHROMIUM || [
    '/opt/pw-browsers/chromium/chrome-linux/chrome',
    ...(fs.existsSync('/opt/pw-browsers') ? fs.readdirSync('/opt/pw-browsers').filter(d => d.startsWith('chromium-')).map(d => `/opt/pw-browsers/${d}/chrome-linux/chrome`) : []),
  ].find(p => fs.existsSync(p));
  const browser = await chromium.launch({ executablePath: chromePath, args: ['--no-sandbox'] });

  for (const scheme of ['dark', 'light']) {
    console.log(`\n── HIG, ${scheme === 'dark' ? 'mörkt' : 'ljust'} läge ──`);
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: scheme, serviceWorkers: 'block' });
    const page = await ctx.newPage();
    await page.addInitScript(() => { try { localStorage.setItem('vs_key', 'test-key'); localStorage.setItem('vs_fun', '1'); } catch {} });
    await page.goto(base, { waitUntil: 'networkidle' });
    for (const [label, fn] of Object.entries(SCREENS)) {
      await page.evaluate(`(${fn.toString()})()`);
      await page.waitForTimeout(400);   // låt panelerna glida klart
      const r = await page.evaluate(auditInPage, EXCEPTIONS);
      check(`${label}: träffytor ≥ 44×44`, !r.targets.length, r.targets.join(', '));
      check(`${label}: ingen text under 12 px`, !r.tiny.length, r.tiny.join(', '));
      check(`${label}: kontrast ≥ 4,5:1`, !r.contrast.length, r.contrast.join(', '));
      check(`${label}: alla kontroller har namn`, !r.unnamed.length, r.unnamed.join(', '));
    }
    await ctx.close();
  }

  console.log('\n── HIG, Reduce Motion ──');
  for (const rm of ['no-preference', 'reduce']) {
    const ctx = await browser.newContext({ reducedMotion: rm, serviceWorkers: 'block' });
    const page = await ctx.newPage();
    await page.goto(base, { waitUntil: 'networkidle' });
    const d = await page.evaluate(() => ({
      ring: parseFloat(getComputedStyle(document.querySelector('.record-btn'), '::before').animationDuration),
      dot: parseFloat(getComputedStyle(document.querySelector('.rec-dot')).animationDuration),
      panel: parseFloat(getComputedStyle(document.querySelector('#s-panel')).transitionDuration),
    }));
    if (rm === 'reduce') check('Reduce Motion stänger av puls, blinkning och panelglid', d.ring < .01 && d.dot < .01 && d.panel < .01, JSON.stringify(d));
    else check('utan Reduce Motion finns animationerna kvar', d.ring > 0 && d.dot > 0 && d.panel > 0, JSON.stringify(d));
    await ctx.close();
  }

  await browser.close(); server.close();
  console.log(`\n══ HIG: ${pass} godkända, ${fail} underkända ══`);
  process.exit(fail ? 1 : 0);
})();
