// Genererar alla Dianes appikoner från ett enda motiv ("Ljud blir text":
// ljudvåg som övergår i textrader = inspelning → sammanfattning).
//
//   node scripts/make-icons.js
//
// Skriver: Androids adaptiva ikon (bakgrund, förgrund, monokrom för
// tematiserade ikoner i Android 13+) och äldre ikoner i alla upplösningar,
// webbikonerna samt Play Store-ikonen och en 1024-master i docs/brand.
// Kräver playwright-core (finns som devDependency) och Python med Pillow.
const { chromium } = require('playwright-core');
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const RES = path.join(ROOT, 'android/app/src/main/res');
const BRAND = path.join(ROOT, 'docs/brand/app-icon');
const TMP = fs.mkdtempSync(path.join(require('os').tmpdir(), 'diane-icons-'));

// Motivet ritat runt mittpunkten (0,0), 440 × 320 enheter
const MOTIF = (wave, text) => `
  <g fill="${wave}">
    <rect x="-220" y="-80" width="56" height="160" rx="28"/>
    <rect x="-132" y="-160" width="56" height="320" rx="28"/>
    <rect x="-44" y="-104" width="56" height="208" rx="28"/>
  </g>
  <g fill="${text}">
    <rect x="44" y="-108" width="176" height="56" rx="28"/>
    <rect x="44" y="-28" width="132" height="56" rx="28"/>
    <rect x="44" y="52" width="160" height="56" rx="28"/>
  </g>`;
const BG = `<defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
  <stop offset="0" stop-color="#22224a"/><stop offset="1" stop-color="#11112a"/></linearGradient></defs>`;

// scale = motivets bredd som andel av ytan
const svg = ({ bg = true, wave = '#e94560', text = '#e8e8f0', scale = 0.52 }) => {
  const k = (1024 * scale) / 440;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">${BG}
    ${bg ? '<rect width="1024" height="1024" fill="url(#bg)"/>' : ''}
    <g transform="translate(512 512) scale(${k})">${MOTIF(wave, text)}</g></svg>`;
};

// Adaptiv ikon: 108 dp-yta där bara mitten (72 dp) syns och 66 dp är säker
// zon. Motivet får samma storlek i den synliga ytan som i den fyrkantiga
// ikonen: 0,52 × 72/108 ≈ 0,347 av hela ytan.
const ADAPTIVE_SCALE = 0.52 * 72 / 108;

const DENSITIES = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };

async function render(page, markup, file, transparent) {
  await page.setContent(`<body style="margin:0;background:transparent">${markup}</body>`);
  await page.screenshot({ path: file, clip: { x: 0, y: 0, width: 1024, height: 1024 }, omitBackground: transparent });
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1024, height: 1024 } });
  const src = {
    full: svg({}),
    bg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">${BG}<rect width="1024" height="1024" fill="url(#bg)"/></svg>`,
    fg: svg({ bg: false, scale: ADAPTIVE_SCALE }),
    mono: svg({ bg: false, wave: '#ffffff', text: '#ffffff', scale: ADAPTIVE_SCALE }),
  };
  for (const [k, markup] of Object.entries(src)) await render(page, markup, `${TMP}/${k}.png`, k !== 'full' && k !== 'bg');
  await browser.close();

  fs.mkdirSync(BRAND, { recursive: true });
  fs.writeFileSync(path.join(BRAND, 'diane-icon.svg'), src.full);
  fs.writeFileSync(path.join(ROOT, 'icon.svg'), src.full);

  // Storleksändring och format i Python/Pillow (Lanczos ger skarpa kanter)
  const py = `
import json, sys
from PIL import Image, ImageDraw
tmp, res, brand, root, dens = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4], json.loads(sys.argv[5])
full = Image.open(f'{tmp}/full.png').convert('RGBA')
layers = {n: Image.open(f'{tmp}/{n}.png').convert('RGBA') for n in ('bg', 'fg', 'mono')}
def circle(im):
    m = Image.new('L', im.size, 0); ImageDraw.Draw(m).ellipse((0, 0, im.size[0]-1, im.size[1]-1), fill=255)
    out = Image.new('RGBA', im.size, (0, 0, 0, 0)); out.paste(im, (0, 0), m); return out
for d, f in dens.items():
    a, l = round(108*f), round(48*f)
    for n, file in (('bg', 'ic_launcher_background'), ('fg', 'ic_launcher_foreground'), ('mono', 'ic_launcher_monochrome')):
        layers[n].resize((a, a), Image.LANCZOS).save(f'{res}/mipmap-{d}/{file}.png')
    sq = full.resize((l, l), Image.LANCZOS)
    sq.save(f'{res}/mipmap-{d}/ic_launcher.png')
    circle(sq).save(f'{res}/mipmap-{d}/ic_launcher_round.png')
# Play Store: 512×512, 32-bitars PNG, hel yta (Play lägger på sin egen form)
full.resize((512, 512), Image.LANCZOS).save(f'{brand}/play-store-512.png')
full.save(f'{brand}/diane-icon-1024.png')
# Webben/PWA (maskable: motivet ligger väl inom 80 %-zonen)
full.convert('RGB').resize((512, 512), Image.LANCZOS).save(f'{root}/icon-512.png')
full.convert('RGB').resize((192, 192), Image.LANCZOS).save(f'{root}/icon-192.png')
# Startskärm för Android < 12: Dianes bakgrund med motivet i mitten, i varje
# befintlig storlek (stående och liggande). Android 12+ använder i stället
# windowSplashScreen* i styles.xml.
import glob
fg_full = Image.open(f'{tmp}/fg.png').convert('RGBA')
for f in glob.glob(f'{res}/drawable*/splash.png'):
    w, h = Image.open(f).size
    bgimg = layers['bg'].resize((max(w, h), max(w, h)), Image.LANCZOS).crop((0, 0, w, h))
    side = round(min(w, h) * 0.9)
    motif = fg_full.resize((side, side), Image.LANCZOS)
    bgimg.alpha_composite(motif, ((w - side) // 2, (h - side) // 2))
    bgimg.convert('RGB').save(f)
print('ikoner och startskärmar skrivna')
`;
  execFileSync('python3', ['-c', py, TMP, RES, BRAND, ROOT, JSON.stringify(DENSITIES)], { stdio: 'inherit' });
  fs.rmSync(TMP, { recursive: true, force: true });
})();
