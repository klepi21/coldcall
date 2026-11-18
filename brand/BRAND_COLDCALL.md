# Cold Call brand (v1, 18 Nov 2026)

Cold Call is a skill games arena on Sui devnet: Chess, Backgammon, Tichu and Ice Floe Battle. Players stake test LOFI and SUI coins. It is built for CLAY, the Lofi the Yeti hackathon on Sui, so it lives in the same snowy Himalayan world, with a high roller card lounge twist.

## Name
**COLD CALL.** In poker, a cold call is calling a bet (and a raise) without having put money in yet: a cool, confident move. It also says "cold", which places us in the snow, and "call", which is what you do when you think the other player is bluffing. Two short words, easy to say, and they read well in a chunky display font.

## Taglines
Main: **Play it cool. Call their bluff.**

Options:
- Stay frosty. Take the pot.
- Cool heads win.
- Ice in your veins. Chips on the table.
- Your move, high roller.

## Voice
Chill, dry and confident, like a dealer who has seen every bluff. Short sentences. A little wink, never a shout.
- Do: "Nice hand.", "Your move.", "That one got away. Rematch?", "Test coins only. This is devnet."
- Do not: hype, pressure, fake urgency, crypto slang overload, or anything that hides a fee.
- Always honest about money: on devnet every stake uses test LOFI and test SUI with no real value, and the UI says so.
- Plain English everywhere. No em dashes, no en dashes, no middots.

## Palette
| Name | Hex | Use |
|---|---|---|
| Glacier Navy | `#0B1A2E` | page background (base) |
| Deep Ice | `#13294A` | cards, panels, raised surfaces |
| Lofi Blue | `#5A8FE0` | primary brand blue, mascot skin, main buttons |
| Frost Cyan | `#7FE3FF` | highlights, focus rings, links, glow on ice |
| Snow | `#F2F7FC` | text on dark, card faces, fur |
| Chip Gold | `#F5C542` | money only: pots, payouts, chip rims, the gold chain |
| Sui Blue | `#4DA2FF` | SUI coin and SUI amounts only |
| Thaw Green | `#3DDC97` | success, wins, "your turn" |
| Bust Red | `#FF5A6E` | danger, losses, errors |
| Ink | `#080E1A` | outlines on illustrations and the wordmark |

Rules: gold means money and nothing else. Green and red are for outcomes, not decoration. Text on Glacier Navy is Snow (primary) or Frost Cyan (secondary); both pass WCAG AA.

## Typography
- Display: **Lilita One** (Google Fonts, SIL Open Font License 1.1). Chunky and rounded, matches the thick cartoon outlines. Use for the logo look, headings, buttons, big numbers and win banners. Never for long text.
- UI and body: **Inter** (Google Fonts, SIL Open Font License 1.1). Use tabular numbers (`font-variant-numeric: tabular-nums`) for balances, stakes and clocks.
- The TTF files and licences are in `brand/fonts/`.

## Logo
- **Wordmark** (`logo.png`): COLD CALL in Lilita One with an icy fill (Snow to Frost Cyan), a thick Ink outline, a Lofi Blue drop shadow and four icicles. Drawn in code (`brand/src/draw_assets.py`), so it can be re rendered at any size.
- **Logo with mascot** (`logo-mascot.png`): Lucky Lo's head and shoulders sitting on top of the wordmark. Use it on the landing page and splash screens.
- **App icon** (`icon-1024.png`): Lucky Lo's head and shoulders on a navy glow with light snow. An alternative mark, the CC snow chip with two small horns, is kept as `brand/out/icon-chip-1024.png` for places where the face is too detailed.
- **Favicon** (`favicon.png`, 64 px): the CC snow chip without horns, readable at 16 px.
- Clear space around any logo: at least the height of the letter C.
- Best on Glacier Navy or Deep Ice. On light backgrounds keep the Ink outline; never remove it.
- Do not recolour, stretch, rotate, add effects, or set the wordmark in another font.

## Mascot: Lucky Lo
**Name choice: Lucky Lo** over Mr. Chill. "Lo" nods to Lofi, so he clearly belongs to the same family as a cousin, while "Lucky" says card table and high roller in one word. Mr. Chill describes a mood that half the snow mascots on the internet already have; Lucky Lo is a name you can put on a chip.

Who he is: Lofi's smug cousin who runs the card table at a lounge carved into the mountain. He has seen every bluff and he is not impressed. Relaxed, never angry, never desperate.

Look (locked, built as vector art in `brand/src/mascot.py`):
- Same flat cartoon style as the Lofi universe: thick black outlines, flat colours, simple cel shading.
- White shaggy fur with jagged tufted edges. Face, ears, hands and feet in Lofi Blue `#5A8FE0`.
- Wide meme style face: heavy half closed eyelids, smug relaxed eyes, small round nose, wide flat lips.
- Two small curved blue horns.
- Dealer outfit: translucent green dealer visor, dark navy satin vest over a white shirt, small gold bow tie, thin gold chain with a snowflake pendant.
- Signature prop: a small candy cane held in the corner of his mouth like a toothpick (never a cigar, nothing smoked).
- Optional sunglasses: dark rounded shades with a frost glint (`brand/out/mascot-shades.png`). Use sparingly, for promo moments; the half lidded eyes are his real face.
- Cartoon hands with three fingers and a thumb.

Rules:
- **Never headphones**, earmuffs or anything over his ears. Never a glowing drop. He must not look like any other yeti mascot outside the Lofi family.
- Never smoking, drinking or holding cash bundles. Money shows up as chips only.
- Never sad or angry at the player. When the player loses he shrugs; when they win he grins with them.
- Keep him on transparent backgrounds over brand colours; do not crop through his face.

Poses and when to use them:
| File | Pose | Use |
|---|---|---|
| `mascot-neutral.png` | neutral smug, chip in hand | lobby, empty states, loading |
| `mascot-win.png` | cheeky grin, fist pump, chips flying | win screen, payout confirmed |
| `mascot-deal.png` | dealing a fan of cards | matchmaking, "finding a table", Tichu |
| `mascot-shrug.png` | palms up shrug | loss, draw, errors, "nothing here yet" |

## Coins and chips
- `lofi-chip.png`: snow white casino chip with Lofi Blue edge inserts, a dashed gold ring and a blue snowflake. Reads "LOFI".
- `sui-chip.png`: Sui Blue chip with snow inserts and a generic water drop (not the official Sui logo). Reads "SUI".
- Chips never say "devnet" on their face. The UI next to every balance says "test coins on devnet".

## Snow theme per game
**Chess: pieces of ice.** One side is clear frosted ice with a cyan inner glow, the other is deep blue glacier ice. The board is packed snow and dark navy ice squares with a thin frost line between them. A capture shatters the piece into a few shards that melt away. Last move highlight in Frost Cyan, check in Bust Red.

**Backgammon: frozen wood.** A pale pine board with a light layer of frost in the corners, points in Snow and Lofi Blue. Checkers are ice pucks: one set frosted white, one set Deep Ice blue, each with a thin gold rim on the stack top. Dice are ice cubes with Snow pips that clink when rolled. The doubling cube is a gold rimmed ice cube.

**Tichu: the lounge deck.** Cards keep the standard Tichu suit conventions so players recognise them, on Snow card faces with Ink outlines. Card backs are Lofi Blue with a white snowflake and a thin gold border. Lucky Lo appears on the special cards: the Dragon (Lo in a dragon scarf), the Phoenix (Lo with ice wings), the Dog (Lo shrugging) and the Mah Jong (Lo dealing). The table is ice blue felt.

**Ice Floe Battle: icebreakers on a frozen lake.** The grid is a frozen lake seen from above, cut into ice tiles. Each player hides a fleet of small cartoon icebreaker ships. A miss leaves a small snow puff and a hairline crack. A hit cracks the ice open in a star pattern and shows dark water; a sunk ship sinks into an open hole that slowly refreezes. Shots fall like snowballs.

## Illustration and imagery
- Flat cartoon, thick outlines, flat colours. No photo realism, no 3D renders mixed with flat art.
- Scenes: a cosy lounge carved into a Himalayan peak, night sky, gentle snowfall, warm gold lamps against icy blue.
- No slot machines, no cash stacks, no flames.

## Files
All art is drawn in code, so every asset can be re rendered at any size or tweaked by editing numbers.
- `brand/src/draw_assets.py`: wordmark, LOFI and SUI chips, CC chip icon, favicon.
- `brand/src/mascot.py`: Lucky Lo as SVG (each part is a function: fur, face, eyes, mouth, visor, vest, hands, chips, cards). Writes `brand/svg/*.svg` and renders PNGs with `rsvg-convert`.
- `brand/src/compose.py`: logo with mascot, mascot app icon, the hero scene (vector, `brand/svg/hero-scene.svg`), og image, brand board and the web exports.
- Run order: `python3 brand/src/draw_assets.py && python3 brand/src/mascot.py && python3 brand/src/compose.py`. compose.py also reduces the web PNGs to 256 colour palettes (no visible change on flat art).
- Masters: `brand/out/`. Web files: `apps/web/public/brand/`. Board: `brand/brand-board.png`.
