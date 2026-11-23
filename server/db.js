// SQLite en local o SQL Server (DB_DRIVER=mssql, local o Amazon RDS).
// Ambos exponen all(sql, params), run(sql, params), tx(fn) y limit(n). Los parámetros van con "?".
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { dbSecret } from './aws.js';

const env = process.env;
export const driver = env.DB_DRIVER === 'mssql' ? 'mssql' : 'sqlite';

async function sqlite() {
  const { DatabaseSync } = await import('node:sqlite');
  const file = env.SQLITE_FILE || 'database/ecoraee.db';
  mkdirSync(dirname(file), { recursive: true });
  const fresh = !existsSync(file);
  const db = new DatabaseSync(file);
  db.exec('PRAGMA foreign_keys=ON');
  if (fresh) db.exec(readFileSync('database/sqlite.sql', 'utf8'));
  const api = {
    limit: (n) => `LIMIT ${n}`,
    all: async (q, p = []) => db.prepare(q).all(...p),
    run: async (q, p = []) => {
      const r = db.prepare(q).run(...p);
      return { id: Number(r.lastInsertRowid), changes: Number(r.changes) };
    },
    tx: async (fn) => {
      db.exec('BEGIN');
      try { const r = await fn(api); db.exec('COMMIT'); return r; }
      catch (e) { db.exec('ROLLBACK'); throw e; }
    },
  };
  return api;
}

async function mssql() {
  const sql = (await import('mssql')).default;
  const secret = await dbSecret();
  const encrypt = env.DB_ENCRYPT === 'true';
  const pool = await sql.connect({
    server: env.DB_HOST || secret.host || 'localhost',
    port: Number(env.DB_PORT || secret.port || 1433),
    database: env.DB_NAME || 'EcoRAEE',
    user: secret.user || env.DB_USER,
    password: secret.password || env.DB_PASSWORD,
    pool: { max: 10, idleTimeoutMillis: 30000 },
    options: { encrypt, trustServerCertificate: !encrypt },
  });
  const make = (newRequest) => ({
    limit: (n) => `OFFSET 0 ROWS FETCH NEXT ${n} ROWS ONLY`,
    all: async (q, p = []) => (await exec(newRequest(), q, p)).recordset,
    run: async (q, p = []) => {
      const insert = /^\s*INSERT/i.test(q);
      const r = await exec(newRequest(), insert ? `${q}; SELECT SCOPE_IDENTITY() AS id` : q, p);
      return { id: insert ? Number(r.recordset[0].id) : null, changes: r.rowsAffected[0] };
    },
  });
  const exec = (req, q, p) => {
    let i = 0;
    const text = q.replace(/\?/g, () => `@p${i++}`);
    p.forEach((v, k) => req.input(`p${k}`, v));
    return req.query(text);
  };
  const api = make(() => pool.request());
  api.tx = async (fn) => {
    const t = new sql.Transaction(pool);
    await t.begin();
    try { const r = await fn(make(() => new sql.Request(t))); await t.commit(); return r; }
    catch (e) { await t.rollback(); throw e; }
  };
  return api;
}

export const db = await (driver === 'mssql' ? mssql() : sqlite());
