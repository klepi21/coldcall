import { hmac } from '@noble/hashes/hmac';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, hexToBytes, utf8ToBytes } from '@noble/hashes/utils';

/**
 * Provably fair random stream.
 * Before a game the server publishes commit = sha256(serverSeed).
 * Each block i of randomness is HMAC_SHA256(key = serverSeed, msg = clientSeeds.join(':') + ':' + i).
 * After the game serverSeed is revealed and anyone can recompute every roll and shuffle.
 */
export interface RngState {
  serverSeed: string; // hex, 32 bytes
  clientSeed: string; // joined client seeds
  block: number;
  offset: number;
}

export class Rng {
  private buf: Uint8Array = new Uint8Array(0);
  constructor(private s: RngState) {
    this.refill();
    this.s = { ...s };
  }

  static fromSeeds(serverSeed: string, clientSeeds: string[]): Rng {
    return new Rng({ serverSeed, clientSeed: clientSeeds.join(':'), block: 0, offset: 0 });
  }

  /** Snapshot so the host can persist and resume the exact stream position. */
  get state(): RngState {
    return { ...this.s };
  }

  private refill() {
    const msg = utf8ToBytes(`${this.s.clientSeed}:${this.s.block}`);
    this.buf = hmac(sha256, hexToBytes(this.s.serverSeed), msg);
  }

  private nextByte(): number {
    if (this.s.offset >= this.buf.length) {
      this.s.block += 1;
      this.s.offset = 0;
      this.refill();
    }
    const b = this.buf[this.s.offset]!;
    this.s.offset += 1;
    return b;
  }

  /** Uniform integer in [0, n) using rejection sampling on 32-bit draws (no modulo bias). */
  int(n: number): number {
    if (!Number.isInteger(n) || n <= 0 || n > 2 ** 32) throw new Error('bad range');
    const limit = Math.floor(2 ** 32 / n) * n;
    for (;;) {
      const x =
        ((this.nextByte() << 24) >>> 0) + (this.nextByte() << 16) + (this.nextByte() << 8) + this.nextByte();
      if (x < limit) return x % n;
    }
  }

  /** Die roll 1..6 */
  die(): number {
    return this.int(6) + 1;
  }

  /** Fisher-Yates shuffle, returns a new array. */
  shuffle<T>(items: readonly T[]): T[] {
    const a = items.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      [a[i], a[j]] = [a[j]!, a[i]!];
    }
    return a;
  }

  /** Float in [0,1) for bot randomness only (never for money decisions). */
  float(): number {
    return this.int(2 ** 30) / 2 ** 30;
  }
}

export function commitFor(serverSeed: string): string {
  return bytesToHex(sha256(hexToBytes(serverSeed)));
}

export function randomSeedHex(bytes = 32): string {
  const a = new Uint8Array(bytes);
  globalThis.crypto.getRandomValues(a);
  return bytesToHex(a);
}
