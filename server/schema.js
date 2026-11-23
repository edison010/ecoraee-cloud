// Ejecuta database/sqlserver.sql en SQL Server (RDS), lote por lote (separados por GO).
// Uso en EC2: node server/schema.js
import { readFileSync } from 'node:fs';
import { dbSecret } from './aws.js';

const sql = (await import('mssql')).default;
const env = process.env;
const secret = await dbSecret();
const encrypt = env.DB_ENCRYPT === 'true';
const pool = await new sql.ConnectionPool({
  server: env.DB_HOST, port: Number(env.DB_PORT || 1433), database: 'master',
  user: secret.user || env.DB_USER, password: secret.password || env.DB_PASSWORD,
  pool: { max: 1 }, options: { encrypt, trustServerCertificate: !encrypt },
}).connect();

const lotes = readFileSync('database/sqlserver.sql', 'utf8').split(/^\s*GO\s*$/m).map((b) => b.trim()).filter(Boolean);
for (const lote of lotes) await pool.request().batch(lote);
const [{ n }] = (await pool.request().query("SELECT COUNT(*) AS n FROM EcoRAEE.sys.tables")).recordset;
console.log(`Esquema creado: ${n} tablas en EcoRAEE.`);
await pool.close();
