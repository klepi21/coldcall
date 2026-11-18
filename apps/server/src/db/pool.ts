import pg from 'pg';
import { env } from '../env';

// BIGINT (int8) comes back as string by default. Parse to number and refuse anything unsafe.
pg.types.setTypeParser(20, (v: string) => {
  const n = Number(v);
  if (!Number.isSafeInteger(n)) throw new Error(`int8 out of safe range: ${v}`);
  return n;
});

export const pool = new pg.Pool({ connectionString: env.DATABASE_URL, max: 10 });
export type Db = pg.PoolClient | pg.Pool;

export async function q<T = any>(db: Db, sql: string, params: unknown[] = []): Promise<T[]> {
  const r = await db.query(sql, params as any[]);
  return r.rows as T[];
}
export async function one<T = any>(db: Db, sql: string, params: unknown[] = []): Promise<T> {
  const rows = await q<T>(db, sql, params);
  if (!rows[0]) throw new Error('expected one row');
  return rows[0];
}
export async function maybe<T = any>(db: Db, sql: string, params: unknown[] = []): Promise<T | null> {
  const rows = await q<T>(db, sql, params);
  return rows[0] ?? null;
}

/** Serializable transaction with automatic retry on serialization failures and deadlocks. */
export async function tx<T>(fn: (c: pg.PoolClient) => Promise<T>, attempts = 5): Promise<T> {
  for (let i = 0; ; i++) {
    const c = await pool.connect();
    try {
      await c.query('begin isolation level serializable');
      const out = await fn(c);
      await c.query('commit');
      return out;
    } catch (e: any) {
      await c.query('rollback').catch(() => {});
      if ((e?.code === '40001' || e?.code === '40P01') && i < attempts - 1) {
        await new Promise((r) => setTimeout(r, 10 * 2 ** i + Math.random() * 20));
        continue;
      }
      throw e;
    } finally {
      c.release();
    }
  }
}
