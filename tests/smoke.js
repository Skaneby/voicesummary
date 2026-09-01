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

  console.log('\n── 5d. Appläge (Capacitor) ──');
  // Ny sida där window.Capacitor finns innan skriptet körs → APP_MODE = true
  const appPage = await ctx.newPage();
  await appPage.addInitScript(() => {
    window.Capacitor = { isNativePlatform: () => true, Plugins: {} };
  });
  const appErrors = [];
  appPage.on('pageerror', e => appErrors.push(e.message));
  await appPage.goto(base, { waitUntil: 'networkidle' });

  check('inga JS-fel i appläge', appErrors.length === 0, appErrors.join('; '));
  check('APP_MODE är sant', await appPage.evaluate(() => APP_MODE === true));
  check('skärmlistan har signin + paywall', await appPage.evaluate(() =>
    screens.includes('signin') && screens.includes('paywall')));
  check('startar på inloggningsskärmen', await appPage.evaluate(() =>
    $('screen-signin').classList.contains('active')));
  check('nyckel/modell dolda i appläge', await appPage.evaluate(() =>
    [...document.querySelectorAll('.web-only')].every(el => el.style.display === 'none')));
  check('kontoblocket synligt i appläge', await appPage.evaluate(() =>
    [...document.querySelectorAll('.app-only')].every(el => el.style.display !== 'none')));

  // Grinden: utan token → inloggning, med token men utan prenumeration → betalvägg
  check('inspelning utan inloggning → signin', await appPage.evaluate(async () => {
    s.idToken = ''; s.subActive = 0;
    await startRecording();
    return $('screen-signin').classList.contains('active');
  }));
  check('inspelning utan prenumeration → paywall', await appPage.evaluate(async () => {
    s.idToken = 'fejk'; s.subActive = 0;
    await startRecording();
    return $('screen-paywall').classList.contains('active');
  }));

  // Transporten ska gå till proxyn med Bearer-token, inte till Google
  let proxyReq = null;
  await ctx.route('**/diane-api*/**', route => {
    proxyReq = { url: route.request().url(), headers: route.request().headers(),
                 body: JSON.parse(route.request().postData() || '{}') };
    route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ candidates: [{ content: { parts: [{ text: 'TITLE: Test\n<article><p>ok</p></article>' }] }, finishReason: 'STOP' }] }) });
  });
  await appPage.evaluate(async () => {
    s.idToken = 'test-token'; s.subActive = 1; s.elapsed = 90000;
    await generate('ZmFrZQ==', 'audio/webm');
  });
  check('appläge anropar proxyn', !!proxyReq && /\/summarize$/.test(proxyReq.url), proxyReq && proxyReq.url);
  check('Bearer-token skickas med', (proxyReq?.headers?.authorization || '') === 'Bearer test-token');
  check('kroppen har prompt + ljud + längd', !!proxyReq?.body?.prompt && !!proxyReq?.body?.audio_base64 && proxyReq?.body?.audio_seconds === 90);
  check('ingen Gemini-nyckel läcker i appläge', !JSON.stringify(proxyReq?.body || {}).includes('key='));

  // Kontofelen ska styra användaren rätt
  await ctx.unroute('**/diane-api*/**');
  await ctx.route('**/diane-api*/**', route =>
    route.fulfill({ status: 402, contentType: 'application/json', body: JSON.stringify({ error: 'not_subscribed' }) }));
  check('402 från proxyn visar betalväggen', await appPage.evaluate(async () => {
    s.idToken = 'test-token'; s.subActive = 1;
    try { await generate('ZmFrZQ==', 'audio/webm'); } catch {}
    return $('screen-paywall').classList.contains('active');
  }));

  // Funktionerna från webbversionen ska finnas kvar även i appen
  check('Q&A finns kvar i appläge', await appPage.evaluate(() => typeof askQuestion === 'function' && !!$('qaSection')));
  check('Kopiera mail finns kvar i appläge', await appPage.evaluate(() => typeof copyFormatted === 'function'));
  check('kalenderdialogen finns kvar i appläge', await appPage.evaluate(() => typeof openCalendarDialog === 'function' && !!$('calDate')));
  check('Bloggpost finns kvar i appläge', await appPage.evaluate(() => !!PROMPTS.blog && !!STYLE_META.blog));

  // Bakåtnavigering — utan detta stänger bakåtgesten appen mitt i allt
  check('bakåt stänger öppen panel först', await appPage.evaluate(() => {
    show('idle'); openSettings();
    const handled = handleBack();
    return handled === true && !$('s-panel').classList.contains('open');
  }));
  check('bakåt från resultat går till startsidan', await appPage.evaluate(() => {
    show('result');
    return handleBack() === true && $('screen-idle').classList.contains('active');
  }));
  check('bakåt från betalvägg går till inloggning', await appPage.evaluate(() => {
    show('paywall');
    return handleBack() === true && $('screen-signin').classList.contains('active');
  }));
  check('bakåt från startsidan låter appen stängas', await appPage.evaluate(() => {
    show('idle');
    return handleBack() === false;
  }));

  // Prominent disclosure — Play-krav före första inspelningen
  check('inspelning utan samtycke visar disclosure', await appPage.evaluate(async () => {
    localStorage.removeItem('vs_audio_consent');
    s.idToken = 'x'; s.subActive = 1;
    await startRecording();
    return $('disc-panel').style.display === 'block';
  }));
  check('disclosure nämner Google Gemini', await appPage.evaluate(() =>
    /Google Gemini/.test($('disc-panel').textContent)));
  check('samtycke sparas och visas inte igen', await appPage.evaluate(() => {
    store.set('vs_audio_consent', '1');
    return hasAudioConsent() === true;
  }));

  // Köpflöde
  check('köpknappen är kopplad till startPurchase', await appPage.evaluate(() =>
    typeof startPurchase === 'function' && typeof $('paywallSubscribeBtn').onclick === 'function'));
  check('återställ köp finns (Play-krav)', await appPage.evaluate(() =>
    typeof restorePurchases === 'function' && !!$('paywallRestoreBtn')));
  check('okonfigurerad nyckel ger tydligt fel', await appPage.evaluate(async () => {
    window.Capacitor.Plugins.Purchases = { configure: async () => {} };
    s.googleSub = 'abc';
    try { await ensurePurchases(); return false; } catch (e) { return /konfigurerat/.test(e.message); }
  }));
  check('appUserID härleds ur token, inte profilen', await appPage.evaluate(() => {
    const fake = 'a.' + btoa(JSON.stringify({ sub: '12345', email: 'x@y.z' })) + '.c';
    return subFromToken(fake) === '12345';
  }));


  // Förgrundstjänsten: bron måste vara defensiv — saknas plugin:et eller
  // kastar det ska inspelningen fortsätta ändå
  check('bron finns och kraschar inte utan plugin', await appPage.evaluate(() => {
    delete window.Capacitor.Plugins.Recording;
    try { recordingServiceStart(); recordingServiceStop(); return true; } catch { return false; }
  }));
  check('bron anropar plugin:et när det finns', await appPage.evaluate(() => {
    const calls = [];
    window.Capacitor.Plugins.Recording = { start: () => calls.push('start'), stop: () => calls.push('stop') };
    recordingServiceStart(); recordingServiceStop();
    return calls.join(',') === 'start,stop';
  }));
  check('kastande plugin stoppar inte inspelningen', await appPage.evaluate(() => {
    window.Capacitor.Plugins.Recording = { start: () => { throw new Error('nej'); }, stop: () => { throw new Error('nej'); } };
    try { recordingServiceStart(); recordingServiceStop(); return true; } catch { return false; }
  }));


  // Ett 429 från Gemini (objekt-fel) får inte gömmas bakom vårt eget
  // hastighetsgräns-meddelande — då blir felsökning omöjlig
  await ctx.unroute('**/diane-api*/**');
  await ctx.route('**/diane-api*/**', route => route.fulfill({
    status: 429, contentType: 'application/json',
    body: JSON.stringify({ error: { message: 'Quota exceeded for quota metric X' } }) }));
  check('uppströmsfel från Gemini syns i meddelandet', await appPage.evaluate(async () => {
    s.idToken = 't'; s.subActive = 1;
    try { await generate('ZmFrZQ==', 'audio/webm'); return false; }
    catch (e) { return /Quota exceeded/.test(e.message); }
  }));
  await ctx.unroute('**/diane-api*/**');
  await ctx.route('**/diane-api*/**', route => route.fulfill({
    status: 429, contentType: 'application/json', body: JSON.stringify({ error: 'rate_limited' }) }));
  check('vår egen hastighetsgräns ger sitt eget meddelande', await appPage.evaluate(async () => {
    try { await generate('ZmFrZQ==', 'audio/webm'); return false; }
    catch (e) { return /För många förfrågningar/.test(e.message); }
  }));


  // Regression: i appläget saknas API-nyckel, så ALLA Gemini-anrop måste gå
  // via proxyn. Omformatering, transkribering och Q&A missades i Fas 1 och
  // föll tyst sönder i appen.
  await ctx.unroute('**/diane-api*/**');
  let direktTillGoogle = 0;
  await ctx.route('**/generativelanguage.googleapis.com/**', route => {
    direktTillGoogle++;
    route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
  const proxyKroppar = [];
  await ctx.route('**/diane-api*/**', route => {
    proxyKroppar.push(JSON.parse(route.request().postData() || '{}'));
    route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ candidates: [{ content: { parts: [{ text: 'Svar.' }] }, finishReason: 'STOP' }] }) });
  });
  await appPage.evaluate(async () => {
    s.idToken = 't'; s.subActive = 1; s.elapsed = 60000;
    s.resultText = 'Mötet beslutade att köpa motorn.'; s.qaHistory = [];
    s.blob = new Blob(['ljud'], { type: 'audio/webm' }); s.mimeType = 'audio/webm'; s.transcript = '';
    await transcribeAudio();
    $('qaInput').value = 'Vad beslutades?'; await askQuestion();
    try { await generateFromText('tidigare text'); } catch {}
  });
  check('inget anrop går direkt till Google i appläge', direktTillGoogle === 0, 'direkta anrop: ' + direktTillGoogle);
  check('transkribering, Q&A och omformatering går via proxyn', proxyKroppar.length >= 3, 'anrop: ' + proxyKroppar.length);
  check('proxykroppen bär konversationen', proxyKroppar.every(b => Array.isArray(b.contents)));
  check('transkriberingen räknas mot ljudkvoten', proxyKroppar.some(b => b.audio_seconds === 60));
  await ctx.unroute('**/generativelanguage.googleapis.com/**');

  await appPage.close();

  console.log('\n── 5e. Play-krav: publika sidor ──');
  const priv = fs.readFileSync(path.join(ROOT, 'privacy.html'), 'utf8');
  const del = fs.readFileSync(path.join(ROOT, 'delete-account.html'), 'utf8');
  check('integritetspolicy finns', priv.length > 500);
  check('policyn nämner att ljud skickas till Google Gemini', /Gemini/.test(priv));
  check('policyn länkar till kontoradering', /delete-account\.html/.test(priv));
  check('raderingssidan finns', del.length > 500);
  check('raderingssidan beskriver vad som raderas', /Vad som raderas/.test(del));
  check('raderingssidan varnar om prenumerationen', /avslutar inte din prenumeration/i.test(del));

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
