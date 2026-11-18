# Assets and licences

| Asset | Source | Licence |
|---|---|---|
| Cold Call logo and wordmark | drawn for Cold Call (SVG in `components/ui`) | original |
| Game illustrations (landing, lobby) | drawn for Cold Call (`components/app/GameArt.tsx`) | original |
| Chess pieces | drawn for Cold Call (`components/games/chess/pieces.tsx`) | original |
| Backgammon board, checkers, dice | drawn for Cold Call (`components/games/backgammon`) | original |
| Tichu card faces and backs | drawn for Cold Call (`components/games/tichu/cards.tsx`), following the standard Tichu deck conventions (Jade, Swords, Pagodas, Stars, Mah Jong, Dog, Phoenix, Dragon) with original artwork | original |
| Ice Floe Battle ships, grid and effects | drawn for Cold Call (`components/games/seabattle`) | original |
| QR codes | generated in the browser with the `qrcode` npm package | MIT |
| 3D boards (chess, backgammon, Ice Floe Battle) | all geometry, materials and textures generated in code with Three.js, no external models, HDRs or images | original |
| Sounds | generated live with the Web Audio API (`lib/sound.ts`), no recordings | original |
| Fonts: Unbounded, Inter | Google Fonts | SIL Open Font License 1.1 |
| Chess engine | Stockfish 19 via the `stockfish` npm package, run on the server | GPL v3 (server side use; if the engine is ever shipped to browsers, the GPL source offer applies) |
| chess.js | npm | BSD 2 Clause |

## Cold Call brand (18 Nov 2026)

| Asset | Source | Licence |
|---|---|---|
| Wordmark `logo.png` (master `brand/out/logo-wordmark.png`) | drawn in code for Cold Call with Pillow (`brand/src/draw_assets.py`), Lilita One letters, 18 Nov 2026 | original, made for this project |
| `lofi-chip.png`, `sui-chip.png` | drawn in code for Cold Call (`brand/src/draw_assets.py`), 18 Nov 2026. The SUI chip uses a generic water drop, not the official Sui logo | original, made for this project |
| CC snow chip icon (`brand/out/icon-chip-1024.png`, alternative app icon) | drawn in code for Cold Call (`brand/src/draw_assets.py`), 18 Nov 2026 | original, made for this project |
| `favicon.png` (64 px CC chip) | drawn in code for Cold Call (`brand/src/draw_assets.py`), 18 Nov 2026 | original, made for this project |
| Fonts: Lilita One, Inter (`brand/fonts/`) | Google Fonts via github.com/google/fonts | SIL Open Font License 1.1 (licence text alongside) |
| Mascot Lucky Lo: `mascot-neutral.png`, `mascot-win.png`, `mascot-deal.png`, `mascot-shrug.png` (plus `brand/out/mascot-shades.png`, `mascot-bust.png`) | hand built vector art for Cold Call (`brand/src/mascot.py`, SVG sources in `brand/svg/`), rendered with rsvg-convert, 18 Nov 2026. Original character in the flat cartoon style of the Lofi the Yeti universe; no Lofi or LOOP artwork copied or traced | original, made for this project |
| `logo-mascot.png`, mascot `icon-1024.png` (the chip icon is kept as `brand/out/icon-chip-1024.png`) | composed in code from the mascot bust and the wordmark (`brand/src/compose.py`), 18 Nov 2026 | original, made for this project |
| `hero.webp` (1600x900), `og.jpg` (1200x630) | vector scene drawn in code (`brand/src/compose.py`, `brand/svg/hero-scene.svg`): night sky, snowy peaks, ice blue card table, chips, ice chess pawns, Lucky Lo dealing; headline set in Lilita One and Inter, 18 Nov 2026 | original, made for this project |
| `brand/brand-board.png` | composed in code (`brand/src/compose.py`), 18 Nov 2026 | original, made for this project |
| Note | No Higgsfield or other AI generation was used for the Cold Call brand (the account had no credits on 18 Nov 2026), so no generated assets to list | |
| LOFI and SUI coin chips | `apps/web/public/brand/lofi-chip.png`, `sui-chip.png`, made by the brand work for Cold Call; shown next to every amount, with a lettered fallback | original |
| Cold Call wordmark, CC chip, app icons, favicon, og image, hero | `apps/web/public/brand/*`, `apps/web/public/img/cc-chip.png`, icons in `apps/web/public` and `src/app`; drawn in code by the brand work (`brand/src`) | original |
| Lucky Lo mascot poses (neutral, win, deal, shrug, bust, shades) | `apps/web/public/brand/mascot-*.png`, `apps/web/public/img/mascot-*.png`; vector art from `brand/src/mascot.py` | original |
| Lilita One font | `apps/web/src/fonts/LilitaOne-Regular.ttf`, self hosted | SIL Open Font License 1.1 (`OFL-LilitaOne.txt`) |
| Inter font | `apps/web/src/fonts/Inter.woff2`, Latin subset of the brand file, self hosted | SIL Open Font License 1.1 (`OFL-Inter.txt`) |
| Snow themes: ice chess pieces and board, frosted pine backgammon, Tichu snowflake back and Lucky Lo specials, Ice Floe Battle frozen lake, cracks and snow puffs, falling snow | SVG, shaders and CSS in `apps/web/src/components/games` and `globals.css`, drawn for Cold Call | original |
