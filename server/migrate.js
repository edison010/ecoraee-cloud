// Copia los datos de la base local (SQLite) a SQL Server en Amazon RDS.
// Antes se ejecuta database/sqlserver.sql en RDS para crear las tablas.
// Uso en EC2: DB_DRIVER=mssql node server/migrate.js database/ecoraee.db
// Si S3_BUCKET_EVIDENCIAS está definido, también sube a S3 los archivos guardados en local.
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { db, driver } from './db.js';
import { saveFile } from './aws.js';

const ORDEN = ['organizacion', 'categoria_raee', 'tipo_tratamiento', 'sede', 'usuario', 'ruta', 'lote',
  'traslado', 'dispositivo', 'evaluacion', 'tratamiento', 'evento_trazabilidad', 'evidencia'];

if (driver !== 'mssql') throw new Error('Define DB_DRIVER=mssql para migrar hacia SQL Server.');
const local = new DatabaseSync(process.argv[2] || 'database/ecoraee.db', { readOnly: true });

await db.tx(async (t) => {
  for (const tabla of [...ORDEN].reverse()) await t.run(`DELETE FROM ${tabla}`);

  for (const tabla of ORDEN) {
    const filas = local.prepare(`SELECT * FROM ${tabla}`).all();
    if (!filas.length) continue;
    const cols = Object.keys(filas[0]);
    await t.run(`SET IDENTITY_INSERT ${tabla} ON`);
    for (const fila of filas) {
      if (tabla === 'evidencia' && fila.url_archivo.startsWith('local://') && process.env.S3_BUCKET_EVIDENCIAS) {
        const key = fila.url_archivo.slice(8);
        const tipo = key.endsWith('.pdf') ? 'application/pdf' : `image/${key.split('.').pop().replace('jpg', 'jpeg')}`;
        fila.url_archivo = await saveFile(key, await readFile(join('uploads', key)), tipo);
      }
      await t.run(`INSERT INTO ${tabla} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`, cols.map((c) => fila[c]));
    }
    await t.run(`SET IDENTITY_INSERT ${tabla} OFF`);
    console.log(`${tabla}: ${filas.length} filas`);
  }
});

for (const tabla of ORDEN) {
  const [{ pk }] = await db.all(`SELECT COL_NAME(OBJECT_ID('${tabla}'), column_id) AS pk FROM sys.identity_columns WHERE object_id = OBJECT_ID('${tabla}')`);
  await db.run(`DECLARE @m INT = (SELECT ISNULL(MAX(${pk}), 0) FROM ${tabla}); DBCC CHECKIDENT ('${tabla}', RESEED, @m)`);
}
console.log('Migración terminada.');
process.exit(0);
