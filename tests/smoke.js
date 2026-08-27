// Smoke-test för Diane — körs i headless Chromium via playwright-core.
// Kör:  node tests/smoke.js   (från repo-roten; kräver playwright-core + Chromium)
// Testet mockar Gemini-API:t helt — inga riktiga anrop görs.
const { chromium } = require('playwright-core');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };

let pass = 0, fail = 0;
function check(name, ok, extra) {
  if (ok) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? ' — ' + extra : '')); }
}

(async () => {
  const server = http.createServer((req, res) => {
    const file = path.join(ROOT, req.url === '/' ? 'index.html' : req.url.split('?')[0]);
    try {
      res.setHeader('Content-Type', MIME[path.extname(file)] || 'application/octet-stream');
      res.end(fs.readFileSync(file));
    } catch { res.statusCode = 404; res.end('not found'); }
  }).listen(0);
  const base = 'http://127.0.0.1:' + server.address().port;

  // Hitta Chromium: PW_CHROMIUM-miljövariabel, annars vanliga platser
  const chromePath = process.env.PW_CHROMIUM || [
    '/opt/pw-browsers/chromium/chrome-linux/chrome',
    ...(fs.existsSync('/opt/pw-browsers')
      ? fs.readdirSync('/opt/pw-browsers').filter(d => d.startsWith('chromium-')).map(d => `/opt/pw-browsers/${d}/chrome-linux/chrome`)
      : [])
  ].find(p => fs.existsSync(p));
  const browser = await chromium.launch({ executablePath: chromePath, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'], serviceWorkers: 'block' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));

  await page.goto(base, { waitUntil: 'networkidle' });
  await page.evaluate(() => { localStorage.setItem('vs_key', 'test-key'); });

  console.log('\n── 1. Sidladdning ──');
  check('inga JS-fel vid laddning', errors.length === 0, errors.join('; '));
  check('inspelningsknapp finns', await page.evaluate(() => !!document.getElementById('recBtn') || !!document.querySelector('[id*=rec]')));

  console.log('\n── 2. Ren text utan streck (toRichText) ──');
  const rich = await page.evaluate(() => {
    s.title = 'Testmöte';
    return toRichText('<article><section><h2>Beslut</h2><p>Vi köper motorn.</p><ul><li>Punkt ett</li><li>Punkt två</li></ul></section></article>');
  });
  check('inga ─-streck i texten', !rich.includes('─'), JSON.stringify(rich.slice(0, 120)));
  check('inga ═-streck i texten', !rich.includes('═'));
  check('titeln först i versaler', /^TESTMÖTE\n/.test(rich));
  check('rubrik i versaler utan streck', /\nBESLUT\n/.test(rich));
  check('punktlistor kvar', rich.includes('• Punkt ett'));

  console.log('\n── 3. Kopiera mail (formaterat urklipp) ──');
  const clip = await page.evaluate(async () => {
    $('resultBox').innerHTML = '<article><section><h2>Beslut</h2><p>Vi köper motorn.</p></section></article>';
    s.title = 'Testmöte';
    await copyFormatted();
    const items = await navigator.clipboard.read();
    const out = {};
    for (const it of items) for (const t of it.types) out[t] = await (await it.getType(t)).text();
    return out;
  });
  check('urklippet har text/html-variant', !!clip['text/html']);
  check('urklippet har text/plain-variant', !!clip['text/plain']);
  check('HTML-varianten har inline-styles', /font-family:Arial/.test(clip['text/html'] || ''));
  check('titeln som h1 i HTML-varianten', /<h1[^>]*>Testmöte<\/h1>/.test(clip['text/html'] || ''));
  check('titeln exakt en gång i textvarianten', ((clip['text/plain'] || '').match(/TESTMÖTE/g) || []).length === 1, JSON.stringify((clip['text/plain'] || '').slice(0, 80)));
  check('inga streck i textvarianten', !(clip['text/plain'] || '').includes('─') && !(clip['text/plain'] || '').includes('═'));

  console.log('\n── 4. Fråga om mötet (Q&A) ──');
  await page.evaluate(() => showResult('<article><p>Mötet bestämde att köpa motor för 5000 kr.</p></article>', 'protocol'));
  check('qaSection visas för protocol', await page.evaluate(() => $('qaSection').style.display !== 'none'));
  await page.evaluate(() => showResult('<article><p>x</p></article>', 'letter'));
  check('qaSection döljs för letter', await page.evaluate(() => $('qaSection').style.display === 'none'));
  await page.evaluate(() => showResult('<article><p>Mötet bestämde att köpa motor för 5000 kr.</p></article>', 'summary'));

  let qaBodies = [];
  await ctx.route('**/generativelanguage.googleapis.com/**', route => {
    qaBodies.push(JSON.parse(route.request().postData()));
    route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ candidates: [{ content: { parts: [{ text: 'Motorn kostade 5000 kr.' }] }, finishReason: 'STOP' }] }) });
  });
  await page.evaluate(async () => { $('qaInput').value = 'Vad kostade motorn?'; await askQuestion(); });
  check('frågan får svar i tråden', await page.evaluate(() =>
    [...document.querySelectorAll('.qa-a')].some(el => el.textContent.includes('5000'))));
  check('underlaget skickas i första turen', /UNDERLAG/.test(qaBodies[0]?.contents?.[0]?.parts?.[0]?.text || ''));
  await page.evaluate(async () => { $('qaInput').value = 'Bra pris?'; await askQuestion(); });
  check('följdfrågan bär historiken (5 turer)', (qaBodies[1]?.contents?.length || 0) === 5);

  console.log('\n── 5. Transkribering + historik ──');
  await ctx.unroute('**/generativelanguage.googleapis.com/**');
  await ctx.route('**/generativelanguage.googleapis.com/**', route => {
    route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ candidates: [{ content: { parts: [{ text: 'Talare 1: Vi köper motorn för femtusen.' }] }, finishReason: 'STOP' }] }) });
  });
  const trans = await page.evaluate(async () => {
    localStorage.removeItem('vs_history');
    s.blob = new Blob(['fake-audio'], { type: 'audio/webm' });
    s.mimeType = 'audio/webm';
    s.transcript = '';
    s.historyId = saveToHistory('<article><p>x</p></article>', 'Motormöte');
    await transcribeAudio();
    const hist = JSON.parse(localStorage.getItem('vs_history') || '[]');
    return { mem: s.transcript, stored: hist[0]?.transcript || '', id: hist[0]?.id };
  });
  check('transkription i minnet', /femtusen/.test(trans.mem));
  check('transkription i historiken', /femtusen/.test(trans.stored));
  const hist = await page.evaluate(id => {
    s.blob = new Blob(['other'], { type: 'audio/webm' });
    s.transcript = 'annat'; s.qaHistory = [{ q: 'x', a: 'y' }];
    loadFromHistory(id);
    return { transcript: s.transcript, blobNull: s.blob === null, qaLen: s.qaHistory.length };
  }, trans.id);
  check('historik-laddning återställer transkript', /femtusen/.test(hist.transcript));
  check('historik-laddning kopplar bort ljudblob', hist.blobNull);
  check('historik-laddning nollställer Q&A', hist.qaLen === 0);

  console.log('\n── 5b. Kalender med valbar tid ──');
  const cal = await page.evaluate(() => {
    openCalendarDialog();
    return {
      open: $('cal-panel').classList.contains('open'),
      date: $('calDate').value,
      time: $('calTime').value,
      dur: $('calDur').value
    };
  });
  const tomorrow = await page.evaluate(() => {
    const d = new Date(); d.setDate(d.getDate() + 1);
    const p = n => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  });
  check('dialogen öppnas med morgondagens datum', cal.open && cal.date === tomorrow, cal.date);
  check('tiden är förifylld (HH:MM)', /^\d{2}:\d{2}$/.test(cal.time), cal.time);
  check('längd förvald till 1 timme', cal.dur === '60');
  const ics = await page.evaluate(() => {
    const start = new Date('2026-09-01T14:30:00');
    const out = toICS('Testmöte', 'beskrivning', start, 90);
    const fmt = d => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    return { out, expStart: fmt(start), expEnd: fmt(new Date(start.getTime() + 90 * 60000)) };
  });
  check('ICS använder vald starttid', ics.out.includes('DTSTART:' + ics.expStart), ics.expStart);
  check('ICS använder vald längd (90 min)', ics.out.includes('DTEND:' + ics.expEnd));
  const calInvalid = await page.evaluate(async () => {
    $('calDate').value = ''; $('calTime').value = '';
    await confirmCalendar();
    return $('cal-panel').classList.contains('open');
  });
  check('tomt datum/tid stoppas (dialogen stängs ej)', calInvalid === true);
  await page.evaluate(() => closeCalendarDialog());

  console.log('\n── 5c. Bloggpost-förinställning ──');
  const blog = await page.evaluate(() => ({
    card: !!document.querySelector('.format-card[data-fmt="blog"]'),
    prompt: typeof PROMPTS === 'object' && /blog post/i.test(PROMPTS.blog || ''),
    meta: !!STYLE_META.blog,
    pill: !!document.querySelector('.reformat-pill[data-fmt="blog"]'),
    // Alla format ska ha både prompt och meta — fånga halvfärdiga presets
    consistent: Object.keys(STYLE_META).every(k => !!PROMPTS[k]) && Object.keys(PROMPTS).every(k => !!STYLE_META[k])
  }));
  check('formatkort för blog finns', blog.card);
  check('PROMPTS.blog finns och nämner blog post', blog.prompt);
  check('PROMPTS.blog kräver exakt 5 taggar', await page.evaluate(() => /exactly 5 (fitting )?tags/i.test(PROMPTS.blog)));
  check('STYLE_META.blog finns', blog.meta);
  check('reformat-pill för blog byggs', blog.pill);
  check('PROMPTS och STYLE_META är konsistenta', blog.consistent);
  await page.evaluate(() => showResult('<article><section><h2>Idé</h2><p>Text.</p></section></article>', 'blog'));
  const blogUi = await page.evaluate(() => ({
    label: $('resultLabel').textContent,
    qaHidden: $('qaSection').style.display === 'none'
  }));
  check('resultatetikett "Bloggpost klar"', blogUi.label === 'Bloggpost klar', blogUi.label);
  check('Q&A visas inte för blog', blogUi.qaHidden);

  console.log('\n── 6. Service worker ──');
  const swSrc = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  const idx = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  check('sw.js har skipWaiting + clients.claim', /skipWaiting/.test(swSrc) && /clients\.claim/.test(swSrc));
  check('inga kvarvarande streck-tecken i toRichText', !/['"]─['"]|['"]═['"]/.test(idx));

  console.log('\n══ RESULTAT: ' + pass + ' godkända, ' + fail + ' underkända ══');
  await browser.close();
  server.close();
  process.exit(fail ? 1 : 0);
})();
