// Records the Cold Call demo video in segments: real time screen capture of the live site (and the local game previews
// with ?auto=1), with title cards and captions drawn over the page. Each segment is saved as out/segNN.webm.
// Usage: node rec.js [onlySegmentIndex,...]
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const LIVE = 'https://coldcall.45-81-6-214.sslip.io';
const DEV = 'http://localhost:3000';
const OUT = path.join(__dirname, 'out');
const FONT = fs.readFileSync(path.join(__dirname, '../../brand/fonts/LilitaOne-Regular.ttf')).toString('base64');
const ONLY = process.argv[2] ? process.argv[2].split(',').map(Number) : null;
process.env.PATH = '/Users/konstantinoslepidas/.local/bin:' + process.env.PATH;

const CSS = `@font-face{font-family:CCD;src:url(data:font/ttf;base64,${FONT})}
#vcard{position:fixed;inset:0;z-index:2147483646;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;background:radial-gradient(ellipse at 50% 45%,rgba(90,143,224,.6),rgba(11,26,46,.96) 70%);opacity:0;transition:opacity .35s;pointer-events:none;font-family:CCD,sans-serif}
#vcard .n{font-size:34px;color:#7FE3FF;letter-spacing:10px;margin-bottom:10px}
#vcard .t{font-size:118px;line-height:.95;color:#F2F7FC;-webkit-text-stroke:6px #080E1A;paint-order:stroke fill;text-shadow:0 9px 0 #13294A,0 0 60px rgba(127,227,255,.55);padding:0 6%}
#vcard .s{font-family:Inter,system-ui,sans-serif;font-weight:700;font-size:32px;color:#A9C6F0;margin-top:26px;max-width:62%}
#vcard .l{height:9px;width:0;background:linear-gradient(90deg,#5A8FE0,#7FE3FF);border-radius:9px;margin-top:30px;transition:width 1.2s ease-out}
#vcap{position:fixed;left:56px;bottom:52px;z-index:2147483645;font-family:CCD,sans-serif;font-size:44px;color:#F2F7FC;background:rgba(11,26,46,.86);border:3px solid #7FE3FF;border-radius:26px;padding:14px 30px;letter-spacing:1px;opacity:0;transform:translateX(-30px);transition:opacity .35s,transform .45s;box-shadow:0 0 40px rgba(127,227,255,.35);pointer-events:none;max-width:60%}
#vcap small{display:block;font-family:Inter,system-ui,sans-serif;font-weight:700;font-size:22px;color:#A9C6F0;letter-spacing:0;margin-top:4px}
#vtitle{position:fixed;left:0;right:0;top:40%;z-index:2147483645;text-align:center;font-family:CCD,sans-serif;font-size:130px;line-height:.95;color:#F2F7FC;-webkit-text-stroke:7px #080E1A;paint-order:stroke fill;text-shadow:0 10px 0 #13294A,0 0 70px rgba(127,227,255,.6);opacity:0;transform:scale(1.6) rotate(-2deg);transition:opacity .25s,transform .45s cubic-bezier(.2,1.4,.4,1);pointer-events:none}
#vend{position:fixed;inset:0;z-index:2147483646;display:flex;flex-direction:column;align-items:center;justify-content:center;background:radial-gradient(ellipse at center,rgba(90,143,224,.5),rgba(11,26,46,.97));opacity:0;transition:opacity .6s;font-family:CCD,sans-serif;text-align:center}
#vend img{width:620px;filter:drop-shadow(0 20px 40px rgba(0,0,30,.6))}
#vend .t{font-size:46px;color:#7FE3FF;letter-spacing:6px;margin-top:6px}
#vend .p{font-size:52px;color:#0B1A2E;background:linear-gradient(#bfefff,#5A8FE0);border-radius:60px;padding:16px 60px;margin-top:34px;box-shadow:0 8px 0 #13294A,0 0 50px rgba(127,227,255,.5)}
#vend .u{font-size:40px;color:#F2F7FC;margin-top:26px;letter-spacing:2px}
#vend .s{font-family:Inter,system-ui,sans-serif;font-weight:800;font-size:22px;color:#A9C6F0;margin-top:18px;letter-spacing:3px}
#vend .c{position:absolute;bottom:22px;left:0;right:0;font-family:Inter,system-ui,sans-serif;font-size:15px;color:#fff;opacity:.7}
.vcursor-hide *{cursor:none!important}`;

async function overlay(p) {
  await p.evaluate((css) => {
    if (document.getElementById('vcss')) return;
    const s = document.createElement('style');
    s.id = 'vcss';
    s.textContent = css;
    document.head.appendChild(s);
    document.body.insertAdjacentHTML('beforeend', '<div id="vcard"><div class="n"></div><div class="t"></div><div class="s"></div><div class="l"></div></div><div id="vcap"></div><div id="vtitle"></div>');
    // hide onboarding tours and toasts that would cover the shot
    const k = document.createElement('style');
    k.textContent = '[data-sonner-toaster],[role=dialog][aria-label*="tour" i]{}';
    document.head.appendChild(k);
  }, CSS);
}
async function card(p, n, t, s, ms = 2600) {
  await overlay(p);
  await p.evaluate((n, t, s) => {
    const c = document.getElementById('vcard');
    c.querySelector('.n').textContent = n;
    c.querySelector('.t').textContent = t;
    c.querySelector('.t').style.fontSize = t.length > 20 ? '96px' : '118px';
    c.querySelector('.s').textContent = s || '';
    c.style.opacity = 1;
    setTimeout(() => (c.querySelector('.l').style.width = '22vw'), 120);
  }, n, t, s);
  await sleep(ms);
  await p.evaluate(() => {
    const c = document.getElementById('vcard');
    c.style.opacity = 0;
    c.querySelector('.l').style.width = '0';
  });
  await sleep(400);
}
async function cap(p, a, b) {
  await overlay(p);
  await p.evaluate((a, b) => {
    const e = document.getElementById('vcap');
    if (!a) {
      e.style.opacity = 0;
      e.style.transform = 'translateX(-30px)';
      return;
    }
    e.innerHTML = a + (b ? '<small>' + b + '</small>' : '');
    e.style.opacity = 1;
    e.style.transform = 'translateX(0)';
  }, a, b);
}
async function title(p, t, ms = 1800) {
  await overlay(p);
  await p.evaluate((t) => {
    const e = document.getElementById('vtitle');
    e.textContent = t;
    e.style.fontSize = t.length > 16 ? '96px' : '130px';
    e.style.opacity = 1;
    e.style.transform = 'scale(1) rotate(-2deg)';
  }, t);
  await sleep(ms);
  await p.evaluate(() => {
    const e = document.getElementById('vtitle');
    e.style.opacity = 0;
    e.style.transform = 'scale(1.6) rotate(-2deg)';
  });
}
async function click(p, text, root) {
  return p.evaluate((t, root) => {
    const scope = root ? document.querySelector(root) || document : document;
    const el = [...scope.querySelectorAll('button,a,[role=radio],[role=tab]')].find(
      (e) => e.offsetParent && [(e.innerText || ''), (e.getAttribute('aria-label') || '')].some((x) => x.trim().replace(/\s+/g, ' ').toLowerCase().includes(t.toLowerCase())),
    );
    if (!el) return false;
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    setTimeout(() => el.click(), 350);
    return true;
  }, text, root || null);
}
async function onboard(p, show) {
  const has = await p.evaluate(() => !!document.querySelector('[aria-label="Almost there"]'));
  if (!has) return false;
  if (show) await cap(p, 'Pick a name, confirm you are 18', 'Every fee and rule is linked before you play');
  await p.click('#displayName', { clickCount: 3 });
  await p.type('#displayName', 'FrostyLo', { delay: show ? 90 : 0 });
  await sleep(show ? 600 : 100);
  await p.evaluate(() => document.querySelectorAll('[aria-label="Almost there"] input[type=checkbox]').forEach((c) => c.checked || c.click()));
  await sleep(show ? 900 : 200);
  await p.evaluate(() => {
    const b = [...document.querySelectorAll('[aria-label="Almost there"] button')].find((e) => /start my free/i.test(e.innerText));
    if (b) b.click();
  });
  await sleep(show ? 3500 : 2500);
  return true;
}
async function clean(p) {
  await skipTour(p);
  await onboard(p, false);
  await skipTour(p);
}
async function skipTour(p) {
  for (let i = 0; i < 3; i++) {
    const ok = await p.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find((e) => e.offsetParent && /^skip$/i.test((e.innerText || '').trim()));
      if (b) b.click();
      return !!b;
    });
    if (!ok) break;
    await sleep(400);
  }
}
async function scroll(p, y, ms = 1400) {
  await p.evaluate((y, ms) => {
    const start = window.scrollY, t0 = performance.now();
    const step = (t) => {
      const k = Math.min(1, (t - t0) / ms), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      window.scrollTo(0, start + (y - start) * e);
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, y, ms);
  await sleep(ms + 150);
}

// ---------------- segments ----------------
const SEG = [];
// trailer: four games in motion, each with a big punchy title, then the logo slam
SEG.push(async (p) => {
  await p.goto(DEV + '/dev/chess3d?auto=1&page=dark', { waitUntil: 'networkidle2' });
  await sleep(4500);
  return async () => {
    await overlay(p);
    title(p, 'CHESS ON ICE', 2400);
    await sleep(5200);
  };
});
SEG.push(async (p) => {
  await p.goto(DEV + '/dev/backgammon3d?auto=1&page=dark', { waitUntil: 'networkidle2' });
  await sleep(4500);
  return async () => {
    await overlay(p);
    title(p, 'BACKGAMMON IN THE LODGE', 2400);
    await sleep(5200);
  };
});
SEG.push(async (p) => {
  await p.goto(DEV + '/dev/tichu?auto=1', { waitUntil: 'networkidle2' });
  await click(p, 'New game');
  await sleep(2500);
  return async () => {
    await overlay(p);
    title(p, 'LUCKY LO DEALS', 2400);
    await sleep(5600);
  };
});
SEG.push(async (p) => {
  await p.goto(DEV + '/dev/seabattle3d?shots=7', { waitUntil: 'networkidle2' });
  await sleep(4500);
  return async () => {
    await overlay(p);
    title(p, 'CRACK THE LAKE', 2400);
    await sleep(5200);
  };
});
SEG.push(async (p) => {
  await p.goto(LIVE + '/', { waitUntil: 'networkidle2' });
  await sleep(1500);
  return async () => {
    await overlay(p);
    await p.evaluate((logo) => {
      document.body.insertAdjacentHTML('beforeend', '<div id="vend" style="background:radial-gradient(ellipse at center,rgba(42,80,140,.96),rgba(11,26,46,.99))"><img src="' + logo + '"><div class="t">PLAY IT COOL. CALL THEIR BLUFF.</div><div class="s">SKILL GAMES FOR TEST LOFI AND SUI, ON SUI</div></div>');
      const e = document.getElementById('vend');
      e.querySelector('img').style.transform = 'scale(1.7)';
      e.querySelector('img').style.transition = 'transform .6s cubic-bezier(.2,1.4,.4,1)';
      requestAnimationFrame(() => {
        e.style.opacity = 1;
        e.querySelector('img').style.transform = 'scale(1)';
      });
    }, LIVE + '/brand/logo-mascot.png');
    await sleep(5200);
  };
});
// 01 sign in
SEG.push(async (p) => {
  await p.goto(LIVE + '/', { waitUntil: 'networkidle2' });
  await sleep(1200);
  return async () => {
    await card(p, '01', 'SIGN IN WITH GOOGLE', 'zkLogin turns your Google account into a real Sui wallet. No seed phrase, no extension.');
    await scroll(p, 0, 300);
    await click(p, 'Sign in');
    await sleep(1600);
    await cap(p, 'Continue with Google', 'zkLogin: a Sui address from your Google account');
    await sleep(3600);
    await cap(p, 'Or a wallet on this device', 'One tap, nothing to install');
    await sleep(2400);
    await click(p, 'wallet on this device');
    await sleep(4200);
    await skipTour(p);
    await sleep(800);
    await onboard(p, true);
    await skipTour(p);
    await cap(p, 'You are in', 'Cold Call pays every network fee');
    await sleep(2600);
    await cap(p, '');
  };
});
// 02 test coins
SEG.push(async (p) => {
  await p.goto(LIVE + '/wallet', { waitUntil: 'networkidle2' });
  await sleep(1500);
  await clean(p);
  return async () => {
    await card(p, '02', 'FREE TEST COINS', 'Get test SUI and 1,000 test LOFI. The LOFI faucet is a Move contract.');
    await scroll(p, 260, 900);
    await cap(p, 'Get test SUI', 'Sent by the game wallet, rate limited');
    await click(p, 'Get test SUI');
    await sleep(7000);
    await cap(p, 'Get 1,000 test LOFI', 'A sponsored call to the faucet contract');
    await click(p, 'Get 1,000 test LOFI');
    await sleep(8000);
    await cap(p, '');
  };
});
// 03 deposit
SEG.push(async (p) => {
  await p.goto(LIVE + '/wallet', { waitUntil: 'networkidle2' });
  await sleep(1200);
  await clean(p);
  await click(p, 'LOFI');
  await sleep(800);
  return async () => {
    await card(p, '03', 'ADD COINS TO THE VAULT', 'Your coins go into a public Move vault. You sign, the game pays the gas.');
    await scroll(p, 0, 400);
    await click(p, 'Add LOFI');
    await sleep(1500);
    await cap(p, 'Add 500 LOFI', 'Into Vault<LOFI> on Sui devnet');
    await click(p, '500 LOFI', '[role=dialog]');
    await sleep(1500);
    await p.evaluate(() => {
      const d = document.querySelector('[role=dialog]') || document;
      const b = [...d.querySelectorAll('button')].filter((e) => e.offsetParent && /add lofi/i.test(e.innerText)).pop();
      if (b) b.click();
    });
    await sleep(9500);
    await cap(p, 'Credited from the on chain event', 'Every coin backed one to one by the vault');
    await sleep(3500);
    await cap(p, '');
  };
});
// 04 two coins
SEG.push(async (p) => {
  await p.goto(LIVE + '/play', { waitUntil: 'networkidle2' });
  await sleep(1500);
  await clean(p);
  return async () => {
    await card(p, '04', 'TWO COINS, NEVER MIXED', 'Test LOFI and SUI are separate balances. No exchange, no shared pool.');
    await cap(p, 'Switch between LOFI and SUI', 'Tables and matchmaking stay in one coin');
    for (let i = 0; i < 3; i++) {
      await click(p, 'SUI');
      await sleep(1400);
      await click(p, 'LOFI');
      await sleep(1400);
    }
    await cap(p, 'Pick your table', 'Chess, Backgammon, Tichu and Ice Floe Battle');
    await scroll(p, 420, 1600);
    await sleep(2400);
    await cap(p, '');
  };
});
// 05 stakes up front
SEG.push(async (p) => {
  await p.goto(LIVE + '/play', { waitUntil: 'networkidle2' });
  await sleep(1500);
  await clean(p);
  return async () => {
    await card(p, '05', 'STAKES SHOWN UP FRONT', 'Practice free, beat the bot for 2x, or play people for the pot.');
    await click(p, 'Chess against the bot');
    await sleep(1800);
    await cap(p, 'Every outcome before you sit down', 'Win pays 2x. The bot edge is a published 5%');
    await click(p, '10 LOFI', '[role=dialog]');
    await sleep(2400);
    await click(p, '100 LOFI', '[role=dialog]');
    await sleep(2600);
    await cap(p, 'Against people, winner takes the pot', 'A flat 5% fee, shown before you join');
    await click(p, 'People', '[role=dialog]');
    await sleep(3200);
    await cap(p, '');
  };
});
// 06 to 09 the games
const GAME = [
  ['06', 'CHESS ON A FROZEN BOARD', 'Pieces of ice, glacier squares, a fair bot that matches your level.', '/dev/chess3d?auto=1&page=dark', 17000],
  ['07', 'BACKGAMMON IN THE PINE LODGE', 'Ice puck checkers and ice cube dice on frosted pine.', '/dev/backgammon3d?auto=1&page=dark', 17000],
  ['08', 'TICHU WITH LUCKY LO', 'Four players, two teams. Lucky Lo is on every special card.', '/dev/tichu?auto=1', 18000],
  ['09', 'ICE FLOE BATTLE', 'Hide your icebreakers. Every hit cracks the frozen lake.', '/dev/seabattle3d?shots=9', 13000],
];
for (const g of GAME)
  SEG.push(async (p) => {
    await p.goto(DEV + g[3], { waitUntil: 'networkidle2' });
    if (g[3].includes('tichu')) await click(p, 'New game');
    await sleep(2500);
    return async () => {
      await card(p, g[0], g[1], g[2]);
      await sleep(g[4]);
    };
  });
// 10 cash out
SEG.push(async (p) => {
  await p.goto(LIVE + '/wallet', { waitUntil: 'networkidle2' });
  await sleep(1200);
  await clean(p);
  await click(p, 'LOFI');
  await sleep(800);
  return async () => {
    await card(p, '10', 'CASH OUT, CHECKED ON CHAIN', 'The server signs a ticket. The Move vault checks it and pays you. Each ticket works once.');
    await scroll(p, 0, 300);
    await click(p, 'Cash out');
    await sleep(1600);
    await cap(p, 'Cash out 100 LOFI', 'A signed ticket, valid for 10 minutes');
    await click(p, '100', '[role=dialog]');
    await sleep(1400);
    await p.evaluate(() => {
      const d = document.querySelector('[role=dialog]') || document;
      const b = [...d.querySelectorAll('button')].filter((e) => e.offsetParent && /cash out/i.test(e.innerText)).pop();
      if (b) b.click();
    });
    await sleep(10000);
    await cap(p, 'Back in your wallet', 'Verified by the vault contract on Sui');
    await scroll(p, 900, 1600);
    await sleep(2600);
    await cap(p, '');
  };
});
// 11 honest by design
SEG.push(async (p) => {
  await p.goto(LIVE + '/', { waitUntil: 'networkidle2' });
  await sleep(1200);
  return async () => {
    await card(p, '11', 'HONEST BY DESIGN', 'Two public vaults, a published bot edge, no fake numbers, limits you control.');
    const h = await p.evaluate(() => document.body.scrollHeight);
    await cap(p, 'Every coin backed by a public vault', 'Open it on Suiscan and check');
    await scroll(p, h * 0.38, 3200);
    await sleep(1600);
    await cap(p, 'Built on Sui', 'zkLogin, sponsored gas, Move vaults, a test LOFI faucet');
    await scroll(p, h * 0.62, 3200);
    await sleep(2000);
    await cap(p, '');
  };
});
// end card
SEG.push(async (p) => {
  await p.goto(LIVE + '/', { waitUntil: 'networkidle2' });
  await sleep(1200);
  return async () => {
    await overlay(p);
    await p.evaluate((logo) => {
      document.body.insertAdjacentHTML('beforeend', '<div id="vend" style="background:radial-gradient(ellipse at center,rgba(42,80,140,.97),rgba(11,26,46,.995))"><img src="' + logo + '"><div class="t">PLAY IT COOL. CALL THEIR BLUFF.</div><div class="p">PLAY FREE NOW</div><div class="u">coldcall.45-81-6-214.sslip.io</div><div class="s">BUILT ON SUI &nbsp; ZKLOGIN &nbsp; SPONSORED GAS &nbsp; MOVE VAULTS</div><div class="c">Music: Exhilarate and Cool Vibes by Kevin MacLeod (incompetech.com), licensed CC BY 4.0. Made for CLAY, the Lofi the Yeti hackathon on Sui. Devnet test coins only.</div></div>');
      requestAnimationFrame(() => (document.getElementById('vend').style.opacity = 1));
    }, LIVE + '/brand/logo-mascot.png');
    await sleep(7500);
  };
});

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
    args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--window-size=1920,1080', '--hide-scrollbars'],
  });
  const p = await b.newPage();
  await p.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
  p.on('pageerror', (e) => console.log('PAGEERR', e.message.slice(0, 160)));
  await p.evaluateOnNewDocument(() => {
    try {
      localStorage.setItem('coldcall:theme', 'dark');
    } catch {}
  });
  for (let i = 0; i < SEG.length; i++) {
    if (ONLY && !ONLY.includes(i)) continue;
    const run = await SEG[i](p);
    const file = path.join(OUT, 'seg' + String(i).padStart(2, '0') + '.webm');
    const rec = await p.screencast({ path: file });
    await sleep(300);
    await run();
    await rec.stop();
    console.log('segment', i, 'saved');
  }
  await b.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
