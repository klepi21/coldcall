'use client';
import { use, useEffect, useState } from 'react';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';
import { Rng, backgammonEngine, tichuEngine, chessEngine, seaBattleEngine } from '@evens/games';
import { GAMES } from '@evens/shared';
import { Card, Skeleton, Button } from '@/components/ui';
import { api } from '@/lib/api';

interface V {
  id: string;
  game: 'chess' | 'backgammon' | 'tichu' | 'seabattle';
  mode: string;
  status: string;
  seedCommit: string;
  serverSeed: string | null;
  clientSeeds: string[];
  commitMatches: boolean | null;
  moves: { seq: number; seat: number; move: any }[];
  result: any;
  botDisclosure: any;
}

/** Replays the game in the browser from the revealed seed and the move log. */
function replay(v: V) {
  const engine = (v.game === 'chess' ? chessEngine : v.game === 'backgammon' ? backgammonEngine : v.game === 'seabattle' ? seaBattleEngine : tichuEngine) as any;
  const rng = Rng.fromSeeds(v.serverSeed!, v.clientSeeds);
  let s = engine.create({}, rng);
  const rolls: string[] = [];
  let firstDeal: string[] | null = null;
  if (v.game === 'backgammon') rolls.push(`Opening ${(s.opening as number[][]).map((o) => o.join(' and ')).join(', then ')}`);
  if (v.game === 'tichu') firstDeal = (s.hands as string[][]).map((h) => h.slice(0, 8).join(' '));
  for (const m of v.moves) {
    if (m.move?.type === 'resign' || m.move?.type === 'timeout' || m.move?.type === 'abandon') {
      s = engine.forfeit(s, m.seat, m.move.type);
      continue;
    }
    const before = v.game === 'backgammon' ? JSON.stringify(s.rolled) + s.turn : '';
    s = engine.applyMove(s, m.seat, m.move, rng);
    if (v.game === 'backgammon' && JSON.stringify(s.rolled) + s.turn !== before && s.rolled?.length) rolls.push(`Seat ${s.turn + 1} rolled ${s.rolled.slice(0, 2).join(' and ')}`);
  }
  return { result: engine.result(s), rolls, firstDeal };
}

export default function VerifyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [v, setV] = useState<V | null>(null);
  const [check, setCheck] = useState<{ ok: boolean; text: string; rolls: string[]; firstDeal: string[] | null } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    api<V>(`/api/tables/${id}/verify`).then(setV).catch((e) => setErr(e.message));
  }, [id]);

  const run = () => {
    if (!v?.serverSeed) return;
    const commitOk = bytesToHex(sha256(hexToBytes(v.serverSeed))) === v.seedCommit;
    try {
      const r = replay(v);
      const recorded = v.result?.result;
      const same = !!r.result && !!recorded && JSON.stringify(r.result.winners) === JSON.stringify(recorded.winners) && r.result.draw === recorded.draw;
      setCheck({
        ok: commitOk && same,
        text: commitOk ? (same ? 'The seed matches its lock, and replaying every move gives the same result. This game was fair.' : 'The seed matches its lock, but the replay did not reach the same result. Please contact us.') : 'The revealed seed does not match the lock published before the game. Please contact us.',
        rolls: r.rolls,
        firstDeal: r.firstDeal,
      });
    } catch (e: any) {
      setCheck({ ok: false, text: `The replay could not finish: ${e.message}`, rolls: [], firstDeal: null });
    }
  };

  if (err) return <p className="text-text-2">{err}</p>;
  if (!v) return <Skeleton className="mx-auto h-64 max-w-2xl" />;
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="font-display text-[26px] font-extrabold uppercase leading-tight sm:text-[32px]">Verify a game</h1>
      <Card className="p-5">
        <p className="font-semibold">
          {GAMES[v.game].name}, {v.mode === 'practice' ? 'practice' : v.mode === 'bot' ? 'against the bot' : 'against people'}
        </p>
        <p className="text-sm text-text-2">{v.moves.length} moves recorded.</p>
        <div className="mt-4 space-y-3 text-sm">
          <div>
            <p className="font-semibold">Seed lock, published before the game</p>
            <p className="break-all font-mono text-xs text-text-2">{v.seedCommit}</p>
          </div>
          <div>
            <p className="font-semibold">Revealed seed</p>
            <p className="break-all font-mono text-xs text-text-2">{v.serverSeed ?? 'Revealed when the game ends.'}</p>
          </div>
          <div>
            <p className="font-semibold">Player seeds</p>
            <p className="break-all font-mono text-xs text-text-2">{v.clientSeeds.join(', ')}</p>
          </div>
          {v.botDisclosure ? (
            <div>
              <p className="font-semibold">Bot setting for this game</p>
              <p className="text-text-2">
                Your rating {v.botDisclosure.playerRating}
                {v.botDisclosure.engineElo ? `, engine strength ${v.botDisclosure.engineElo}` : `, bot level ${v.botDisclosure.level}`}
                {v.botDisclosure.expected ? `, expected win chance ${Math.round(v.botDisclosure.expected.win * 100)}%` : v.botDisclosure.expectedWin ? `, expected win chance ${Math.round(v.botDisclosure.expectedWin * 100)}%` : ''}.
              </p>
            </div>
          ) : null}
        </div>
        <Button className="mt-5" disabled={!v.serverSeed} onClick={run}>
          Check this game in my browser
        </Button>
        {!v.serverSeed ? <p className="mt-2 text-sm text-text-2">You can check the game once it has ended.</p> : null}
      </Card>
      {check ? (
        <Card className={`border p-5 ${check.ok ? 'border-win/50' : 'border-loss/50'}`}>
          <p className={`font-semibold ${check.ok ? 'text-win' : 'text-loss'}`}>{check.ok ? 'Verified' : 'Something does not match'}</p>
          <p className="mt-1 text-text-2">{check.text}</p>
          {check.rolls.length ? (
            <details className="mt-3">
              <summary className="cursor-pointer text-sm font-semibold">All dice rolls ({check.rolls.length})</summary>
              <ol className="mt-2 max-h-64 list-decimal overflow-auto pl-5 text-sm text-text-2">
                {check.rolls.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ol>
            </details>
          ) : null}
          {check.firstDeal ? (
            <details className="mt-3">
              <summary className="cursor-pointer text-sm font-semibold">First 8 cards dealt to each seat</summary>
              <ul className="mt-2 space-y-1 font-mono text-xs text-text-2">
                {check.firstDeal.map((h, i) => (
                  <li key={i}>
                    Seat {i + 1}: {h}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </Card>
      ) : null}
    </div>
  );
}
