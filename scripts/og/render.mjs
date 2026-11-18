// Renders the social share images (1200x630) into apps/web/public/og/. Run: node scripts/og/render.mjs
import { chromium } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
const here = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(here, '../../apps/web/public/og');

const LOGO = `<svg viewBox="0 0 32 32" width="64" height="64"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7C5CFF"/><stop offset="1" stop-color="#2a1a7a"/></linearGradient></defs><rect x="1" y="1" width="30" height="30" rx="9" fill="url(#g)"/><rect x="7" y="9.5" width="18" height="5" rx="2.5" fill="#fff"/><rect x="7" y="17.5" width="18" height="5" rx="2.5" fill="#C6FF3D"/></svg>`;

const ORB = {
  chess: { c: '#C6FF3D', bg: 'repeating-conic-gradient(#efe9dc 0 25%, #1b1b24 0 50%) 0 0/25% 25%', glyph: '♞', name: 'Chess', line: 'Pure skill. No luck at all.' },
  backgammon: { c: '#FF8A3D', bg: 'repeating-linear-gradient(90deg,#8a5a34 0 14px,#6b4224 14px 26px)', glyph: '⚂', name: 'Backgammon', line: 'Read the dice, race home.' },
  tichu: { c: '#FF4D8D', bg: 'linear-gradient(160deg,#ff4d8d 0%,#7a2a6a 45%,#1c8f6a 100%)', glyph: '🂡', name: 'Tichu', line: 'Two teams, one deck, big calls.' },
  seabattle: { c: '#3DDCFF', bg: 'repeating-linear-gradient(0deg,rgba(61,220,255,.35) 0 2px,transparent 2px 22px),repeating-linear-gradient(90deg,rgba(61,220,255,.35) 0 2px,transparent 2px 22px),radial-gradient(circle at 35% 30%,#1aa6d6,#06324a)', glyph: '⚓', name: 'Sea Battle', line: 'Hide your fleet. Sink theirs.' },
};

function orb(k, size, extra = '') {
  const o = ORB[k];
  return `<div style="position:absolute;${extra};width:${size}px;height:${size}px;border-radius:50%;overflow:hidden;box-shadow:0 0 ${size / 3}px ${o.c}88;outline:2px solid ${o.c}aa;outline-offset:-2px">
    <div style="position:absolute;inset:-6%;background:${o.bg};transform:perspective(${size * 2}px) rotateY(-18deg) rotateX(12deg) scale(1.1)"></div>
    <div style="position:absolute;inset:0;border-radius:50%;background:radial-gradient(circle at 32% 28%,rgba(255,255,255,.45),rgba(255,255,255,0) 32%),radial-gradient(circle at 50% 50%,rgba(0,0,0,0) 45%,rgba(0,0,0,.55) 75%,rgba(0,0,0,.9) 100%)"></div>
    <div style="position:absolute;inset:0;border-radius:50%;box-shadow:inset 0 0 ${size / 10}px ${o.c}aa"></div>
  </div>`;
}
const coin = (size, extra) => `<div style="position:absolute;${extra};width:${size}px;height:${size}px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#ffe58a,#e0a91c 55%,#9a6a06);box-shadow:0 0 70px rgba(255,210,63,.55),inset 0 0 0 ${size * 0.06}px rgba(255,240,180,.35);display:grid;place-items:center"><div style="display:grid;gap:${size * 0.07}px"><span style="display:block;width:${size * 0.46}px;height:${size * 0.12}px;border-radius:99px;background:#8a5c00"></span><span style="display:block;width:${size * 0.46}px;height:${size * 0.12}px;border-radius:99px;background:#8a5c00"></span></div></div>`;

const page = (inner) => `<!doctype html><html><head><link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Unbounded:wght@700;800&family=Inter:wght@500;600;700&display=block" rel="stylesheet"><style>
*{box-sizing:border-box;margin:0}body{width:1200px;height:630px;overflow:hidden;background:#07070c;font-family:Inter,sans-serif;color:#f4f4fb;position:relative}
.neb{position:absolute;inset:0;background:radial-gradient(55% 70% at 72% 40%,rgba(124,92,255,.55),transparent 70%),radial-gradient(40% 50% at 10% 100%,rgba(198,255,61,.14),transparent 70%),radial-gradient(30% 40% at 95% 95%,rgba(255,77,141,.18),transparent 70%)}
.stars{position:absolute;inset:0;background-image:radial-gradient(1.5px 1.5px at 20px 30px,#fff8,transparent),radial-gradient(1px 1px at 120px 80px,#fff6,transparent),radial-gradient(1.5px 1.5px at 200px 160px,#fff5,transparent),radial-gradient(1px 1px at 320px 40px,#fff7,transparent);background-size:360px 220px;opacity:.7}
.d{font-family:Unbounded,sans-serif;font-weight:800;text-transform:uppercase;letter-spacing:-.02em}
.brand{position:absolute;left:64px;top:56px;display:flex;align-items:center;gap:16px}.brand span{font-size:34px}
.lime{color:#C6FF3D;text-shadow:0 0 40px rgba(198,255,61,.45)}
.pill{display:inline-flex;align-items:center;gap:10px;border:2px solid rgba(198,255,61,.45);background:rgba(198,255,61,.1);color:#C6FF3D;border-radius:99px;padding:10px 20px;font-weight:700;font-size:22px;letter-spacing:.06em;text-transform:uppercase}
</style></head><body><div class="neb"></div><div class="stars"></div>${inner}</body></html>`;

const brand = `<div class="brand">${LOGO}<span class="d">Cold Call</span></div>`;

const DEFAULT = page(`${brand}
<div style="position:absolute;left:64px;top:158px;width:640px">
  <div class="d" style="font-size:72px;line-height:.95">Four games.<br><span class="lime">One arena.</span></div>
  <p style="margin-top:24px;font-size:27px;line-height:1.35;color:#d6d6e8">Chess, backgammon, Tichu and Sea Battle.<br>Real people or a fair bot. Winner takes the pot.</p>
  <div style="margin-top:28px" class="pill">Play free now</div>
</div>
<div style="position:absolute;left:700px;top:0;width:500px;height:630px">
  <div style="position:absolute;left:40px;top:150px;width:420px;height:330px;border:2px solid rgba(255,255,255,.12);border-radius:50%;transform:rotate(-14deg)"></div>
  ${coin(210, 'left:145px;top:210px')}
  ${orb('chess', 120, 'left:20px;top:360px')}
  ${orb('backgammon', 104, 'left:70px;top:110px')}
  ${orb('tichu', 96, 'left:330px;top:80px')}
  ${orb('seabattle', 118, 'left:340px;top:380px')}
</div>`);

function gamePage(k) {
  const o = ORB[k];
  return page(`${brand}
<div style="position:absolute;left:64px;top:175px;width:640px">
  <div class="pill" style="border-color:${o.c}77;background:${o.c}1a;color:${o.c}">You are invited</div>
  <div class="d" style="margin-top:26px;font-size:92px;line-height:.95">${o.name}</div>
  <p style="margin-top:22px;font-size:29px;line-height:1.35;color:#d6d6e8">${o.line}<br>Join the table. Winner takes the pot.</p>
</div>
<div style="position:absolute;right:-60px;top:70px;width:560px;height:560px">
  <div style="position:absolute;inset:0;border-radius:50%;background:radial-gradient(circle,${o.c}33,transparent 65%)"></div>
  ${orb(k, 380, 'left:90px;top:90px')}
  ${coin(120, 'left:40px;top:60px')}
</div>`);
}

const b = await chromium.launch({ executablePath: process.env.PW_EXE || `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell` });
const p = await b.newPage({ viewport: { width: 1200, height: 630 } });
for (const [name, html] of [['default', DEFAULT], ...Object.keys(ORB).map((k) => [k, gamePage(k)])]) {
  await p.setContent(html, { waitUntil: 'networkidle' });
  await p.evaluate(() => document.fonts.ready);
  await p.screenshot({ path: `${OUT}/${name}.png` });
  console.log('wrote', name);
}
await b.close();
