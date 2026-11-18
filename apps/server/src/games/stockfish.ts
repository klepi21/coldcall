import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const enginePath = join(dirname(require.resolve('stockfish/package.json')), 'bin', 'stockfish-19-lite-single.js');

/** One Stockfish process handling requests one at a time. A small pool spreads the load. */
class Engine {
  private proc: ChildProcessWithoutNullStreams;
  private buf = '';
  private waiters: { match: (l: string) => boolean; resolve: (l: string) => void }[] = [];
  private queue: Promise<unknown> = Promise.resolve();

  constructor() {
    this.proc = spawn(process.execPath, [enginePath]);
    this.proc.stdout.setEncoding('utf8');
    this.proc.stdout.on('data', (d: string) => {
      this.buf += d;
      let i;
      while ((i = this.buf.indexOf('\n')) >= 0) {
        const line = this.buf.slice(0, i).trim();
        this.buf = this.buf.slice(i + 1);
        const w = this.waiters.findIndex((x) => x.match(line));
        if (w >= 0) this.waiters.splice(w, 1)[0]!.resolve(line);
      }
    });
    this.send('uci');
  }
  private send(cmd: string) {
    this.proc.stdin.write(cmd + '\n');
  }
  private wait(match: (l: string) => boolean, ms = 15000): Promise<string> {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('stockfish timeout')), ms);
      this.waiters.push({ match, resolve: (l) => (clearTimeout(t), resolve(l)) });
    });
  }

  bestMove(fen: string, o: { limitStrength: boolean; elo?: number; skill?: number; movetimeMs: number }): Promise<string> {
    const run = async () => {
      this.send('ucinewgame');
      this.send(`setoption name UCI_LimitStrength value ${o.limitStrength}`);
      if (o.limitStrength && o.elo) this.send(`setoption name UCI_Elo value ${Math.round(o.elo)}`);
      this.send(`setoption name Skill Level value ${o.limitStrength ? 20 : (o.skill ?? 20)}`);
      this.send('isready');
      await this.wait((l) => l === 'readyok');
      this.send(`position fen ${fen}`);
      this.send(`go movetime ${o.movetimeMs}`);
      const line = await this.wait((l) => l.startsWith('bestmove'));
      return line.split(' ')[1]!;
    };
    const p = this.queue.then(run, run);
    this.queue = p.catch(() => {});
    return p;
  }

  /** Full strength evaluation for post game recaps: centipawns from side to move. */
  evaluate(fen: string, depth = 12): Promise<{ cp: number | null; mate: number | null; best: string }> {
    const run = async () => {
      this.send('ucinewgame');
      this.send('setoption name UCI_LimitStrength value false');
      this.send('setoption name Skill Level value 20');
      this.send(`position fen ${fen}`);
      let cp: number | null = null,
        mate: number | null = null;
      const onData = (d: string) => {
        for (const l of d.split('\n')) {
          const m = / score (cp|mate) (-?\d+)/.exec(l);
          if (m) {
            if (m[1] === 'cp') (cp = Number(m[2])), (mate = null);
            else (mate = Number(m[2])), (cp = null);
          }
        }
      };
      this.proc.stdout.on('data', onData);
      this.send(`go depth ${depth}`);
      const line = await this.wait((l) => l.startsWith('bestmove'), 30000);
      this.proc.stdout.off('data', onData);
      return { cp, mate, best: line.split(' ')[1]! };
    };
    const p = this.queue.then(run, run);
    this.queue = p.catch(() => {});
    return p;
  }

  kill() {
    this.proc.kill();
  }
}

const POOL_SIZE = 2;
const pool: Engine[] = [];
let next = 0;
function engine(): Engine {
  if (pool.length < POOL_SIZE) pool.push(new Engine());
  const e = pool[next % pool.length]!;
  next++;
  return e;
}

export const stockfishMove = (fen: string, o: Parameters<Engine['bestMove']>[1]) => engine().bestMove(fen, o);
export const stockfishEval = (fen: string, depth?: number) => engine().evaluate(fen, depth);
export const stopStockfish = () => pool.forEach((e) => e.kill());
