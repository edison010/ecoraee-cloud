import express from 'express';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { db, driver } from './db.js';
import { resources, meta, clean, SIGUIENTES, TIPOS_EVIDENCIA } from './resources.js';
import { storage, saveFile, openFile, notify } from './aws.js';

const app = express();
app.disable('x-powered-by');

// El frontend publicado en S3 vive en otro origen: solo ese origen puede llamar a la API.
const origins = (process.env.CORS_ORIGIN || '').split(',').map((o) => o.trim()).filter(Boolean);
app.use('/api', (req, res, next) => {
  const origin = req.headers.origin;
  if (origin && origins.includes(origin)) {
    res.set({ 'Access-Control-Allow-Origin': origin, Vary: 'Origin', 'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE', 'Access-Control-Allow-Headers': 'content-type' });
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
app.use(express.json({ limit: '100kb' }));
if (existsSync('dist')) app.use(express.static('dist'));

const ahora = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 19);

const wrap = (fn) => (req, res) => fn(req, res).catch((e) => fail(res, e));

class HttpError extends Error {
  constructor(status, message, fields) { super(message); this.status = status; this.fields = fields; }
}

function fail(res, e) {
  if (e instanceof HttpError) return res.status(e.status).json({ error: e.message, fields: e.fields });
  const m = String(e.message);
  console.error(e);
  if (/UNIQUE|duplicate key|2627|2601/i.test(m)) return res.status(409).json({ error: 'Ya existe un registro con ese valor único (código, RUC, cédula, serie o correo).' });
  if (/FOREIGN KEY|REFERENCE/i.test(m)) return res.status(409).json({ error: 'No se puede completar: el registro está relacionado con otros registros o apunta a uno que no existe.' });
  if (/CHECK constraint/i.test(m)) return res.status(400).json({ error: 'Un valor no cumple las restricciones de la base de datos.' });
  res.status(500).json({ error: 'Error interno del servidor.' });
}

const find = (name) => {
  const r = resources[name];
  if (!r) throw new HttpError(404, 'Recurso no encontrado.');
  return r;
};
const idOf = (req) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) throw new HttpError(400, 'Identificador no válido.');
  return id;
};

app.get('/api/health', wrap(async (_req, res) => {
  await db.all('SELECT 1 AS ok');
  res.json({ ok: true, driver, storage });
}));

app.get('/api/meta', (_req, res) => res.json({ resources: meta, estados: SIGUIENTES, driver, storage }));

app.get('/api/dashboard', wrap(async (_req, res) => {
  const one = async (q) => (await db.all(q))[0];
  const [tot, porEstado, porCategoria, eventos, rutas] = await Promise.all([
    one(`SELECT (SELECT COUNT(*) FROM dispositivo) AS dispositivos,
                (SELECT COALESCE(SUM(peso_kg), 0) FROM dispositivo) AS kg,
                (SELECT COUNT(*) FROM lote WHERE estado <> 'CERRADO') AS lotes_abiertos,
                (SELECT COUNT(*) FROM traslado WHERE estado IN ('PROGRAMADO', 'EN_CURSO')) AS traslados_pendientes`),
    db.all('SELECT estado_actual AS estado, COUNT(*) AS n FROM dispositivo GROUP BY estado_actual'),
    db.all(`SELECT c.nombre, COUNT(*) AS n, SUM(d.peso_kg) AS kg FROM dispositivo d
            JOIN categoria_raee c ON c.id_categoria = d.id_categoria GROUP BY c.nombre ORDER BY kg DESC`),
    db.all(`SELECT e.id_dispositivo, d.codigo_trazabilidad AS codigo, e.estado_nuevo, e.fecha_hora, e.descripcion,
                   CONCAT(u.nombres, ' ', u.apellidos) AS responsable
            FROM evento_trazabilidad e JOIN dispositivo d ON d.id_dispositivo = e.id_dispositivo
            JOIN usuario u ON u.id_usuario = e.id_usuario ORDER BY e.fecha_hora DESC ${db.limit(6)}`),
    db.all(`SELECT r.id_ruta, so.nombre AS origen, sd.nombre AS destino, r.capacidad_kg_mes AS capacidad,
                   COALESCE((SELECT SUM(t.peso_kg) FROM traslado t WHERE t.id_ruta = r.id_ruta AND t.estado <> 'CANCELADO'), 0) AS asignado
            FROM ruta r JOIN sede so ON so.id_sede = r.id_sede_origen JOIN sede sd ON sd.id_sede = r.id_sede_destino
            WHERE r.activa = 1 ORDER BY asignado DESC ${db.limit(5)}`),
  ]);
  res.json({ tot, porEstado, porCategoria, eventos, rutas });
}));

// ---- Trazabilidad de un dispositivo ----
app.get('/api/dispositivo/:id/historial', wrap(async (req, res) => {
  const id = idOf(req);
  const [dispositivo] = await db.all(`SELECT d.*, c.nombre AS categoria FROM dispositivo d
    JOIN categoria_raee c ON c.id_categoria = d.id_categoria WHERE d.id_dispositivo = ?`, [id]);
  if (!dispositivo) throw new HttpError(404, 'Dispositivo no encontrado.');
  const eventos = await db.all(`SELECT e.*, CONCAT(u.nombres, ' ', u.apellidos) AS responsable FROM evento_trazabilidad e
    JOIN usuario u ON u.id_usuario = e.id_usuario WHERE e.id_dispositivo = ? ORDER BY e.fecha_hora, e.id_evento`, [id]);
  res.json({ dispositivo, eventos, siguientes: SIGUIENTES[dispositivo.estado_actual] });
}));

app.post('/api/dispositivo/:id/estado', wrap(async (req, res) => {
  const id = idOf(req);
  const { estado_nuevo, id_usuario, descripcion } = req.body ?? {};
  const fields = {};
  if (!estado_nuevo) fields.estado_nuevo = 'Selecciona el nuevo estado.';
  if (!Number.isInteger(Number(id_usuario)) || !id_usuario) fields.id_usuario = 'Selecciona al responsable.';
  if (descripcion && String(descripcion).length > 300) fields.descripcion = 'Máximo 300 caracteres.';
  if (Object.keys(fields).length) throw new HttpError(400, 'Revisa los campos marcados.', fields);

  const d = await db.tx(async (t) => {
    const [d] = await t.all('SELECT codigo_trazabilidad, estado_actual FROM dispositivo WHERE id_dispositivo = ?', [id]);
    if (!d) throw new HttpError(404, 'Dispositivo no encontrado.');
    if (!SIGUIENTES[d.estado_actual].includes(estado_nuevo))
      throw new HttpError(409, `No se puede pasar de ${d.estado_actual} a ${estado_nuevo}.`, { estado_nuevo: 'Transición no permitida.' });
    if (estado_nuevo === 'EVALUADO') {
      const [{ n }] = await t.all('SELECT COUNT(*) AS n FROM evaluacion WHERE id_dispositivo = ?', [id]);
      if (!n) throw new HttpError(409, 'Registra una evaluación técnica antes de marcar el dispositivo como evaluado.');
    }
    await t.run('UPDATE dispositivo SET estado_actual = ? WHERE id_dispositivo = ?', [estado_nuevo, id]);
    await t.run(
      'INSERT INTO evento_trazabilidad (id_dispositivo, id_usuario, fecha_hora, estado_anterior, estado_nuevo, descripcion) VALUES (?, ?, ?, ?, ?, ?)',
      [id, Number(id_usuario), ahora(), d.estado_actual, estado_nuevo, descripcion?.trim() || null]);
    return d;
  });
  notify(`EcoRAEE: ${d.codigo_trazabilidad} pasó a ${estado_nuevo}`,
    `El dispositivo ${d.codigo_trazabilidad} cambió de ${d.estado_actual} a ${estado_nuevo}.${descripcion ? `\nNota: ${descripcion}` : ''}`);
  res.json({ ok: true });
}));

// ---- Evidencias: el archivo va a S3 y la base guarda la ruta y su SHA-256 ----
const TIPOS_ARCHIVO = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' };

app.get('/api/dispositivo/:id/evidencias', wrap(async (req, res) => {
  res.json(await db.all(`SELECT v.id_evidencia, v.id_evento, v.tipo, v.url_archivo, v.fecha_carga, e.estado_nuevo
    FROM evidencia v JOIN evento_trazabilidad e ON e.id_evento = v.id_evento
    WHERE e.id_dispositivo = ? ORDER BY v.fecha_carga DESC`, [idOf(req)]));
}));

app.post('/api/evidencia/archivo', express.raw({ type: Object.keys(TIPOS_ARCHIVO), limit: '8mb' }), wrap(async (req, res) => {
  const idEvento = Number(req.query.id_evento);
  const tipo = String(req.query.tipo || '');
  const ext = TIPOS_ARCHIVO[req.headers['content-type']];
  if (!ext) throw new HttpError(400, 'Sube una imagen JPG, PNG o WEBP, o un PDF.');
  if (!Buffer.isBuffer(req.body) || !req.body.length) throw new HttpError(400, 'El archivo está vacío.');
  if (!TIPOS_EVIDENCIA.includes(tipo)) throw new HttpError(400, 'Selecciona el tipo de evidencia.', { tipo: 'Selecciona una opción válida.' });
  const [evento] = await db.all(`SELECT e.id_evento, d.codigo_trazabilidad AS codigo FROM evento_trazabilidad e
    JOIN dispositivo d ON d.id_dispositivo = e.id_dispositivo WHERE e.id_evento = ?`, [idEvento]);
  if (!evento) throw new HttpError(404, 'El movimiento no existe.');

  const hash = createHash('sha256').update(req.body).digest('hex');
  const [dup] = await db.all('SELECT id_evidencia FROM evidencia WHERE hash_sha256 = ?', [hash]);
  if (dup) throw new HttpError(409, 'Ese archivo ya se subió antes.');
  const fecha = ahora();
  const key = `${fecha.slice(0, 4)}/${fecha.slice(5, 7)}/${evento.codigo}/${hash.slice(0, 12)}.${ext}`;
  const url = await saveFile(key, req.body, req.headers['content-type']);
  const out = await db.run('INSERT INTO evidencia (id_evento, tipo, url_archivo, hash_sha256, fecha_carga) VALUES (?, ?, ?, ?, ?)',
    [idEvento, tipo, url, hash, fecha]);
  res.status(201).json({ id: out.id, url_archivo: url });
}));

app.get('/api/evidencia', wrap(async (_req, res) => {
  res.json(await db.all(`SELECT v.id_evidencia, v.tipo, v.url_archivo, v.fecha_carga, e.id_evento, e.estado_nuevo,
           d.id_dispositivo, d.codigo_trazabilidad AS codigo
    FROM evidencia v JOIN evento_trazabilidad e ON e.id_evento = v.id_evento
    JOIN dispositivo d ON d.id_dispositivo = e.id_dispositivo ORDER BY v.fecha_carga DESC`));
}));

app.get('/api/evidencia/:id/archivo', wrap(async (req, res) => {
  const [row] = await db.all('SELECT url_archivo FROM evidencia WHERE id_evidencia = ?', [idOf(req)]);
  if (!row) throw new HttpError(404, 'Evidencia no encontrada.');
  const file = await openFile(row.url_archivo);
  if (!file) throw new HttpError(404, 'El archivo de esta evidencia no está disponible.');
  if (file.redirect) return res.redirect(file.redirect);
  const ext = row.url_archivo.split('.').pop();
  res.type(ext).send(file.body);
}));

// ---- CRUD genérico ----
app.get('/api/:res/options', wrap(async (req, res) => {
  const r = find(req.params.res);
  res.json(await db.all(`SELECT ${r.pk} AS id, ${r.label} AS label FROM ${req.params.res} ORDER BY 2`));
}));

app.get('/api/:res', wrap(async (req, res) => {
  const r = find(req.params.res);
  res.json(await db.all(`SELECT * FROM ${req.params.res} ORDER BY ${r.order}`));
}));

app.get('/api/:res/:id', wrap(async (req, res) => {
  const r = find(req.params.res);
  const [row] = await db.all(`SELECT * FROM ${req.params.res} WHERE ${r.pk} = ?`, [idOf(req)]);
  if (!row) throw new HttpError(404, 'Registro no encontrado.');
  res.json(row);
}));

async function save(req, res, creating) {
  const name = req.params.res, r = find(name);
  if (r.custom) throw new HttpError(405, 'Las evidencias se suben como archivo desde la trazabilidad del dispositivo.');
  const id = creating ? null : idOf(req);
  const { data, errors } = clean(r, req.body ?? {}, creating);
  if (Object.keys(errors).length) throw new HttpError(400, errors._ || 'Revisa los campos marcados.', errors);
  const bad = await r.check?.(data, db);
  if (bad) throw new HttpError(400, bad);
  const keys = Object.keys(data), vals = keys.map((k) => data[k]);
  if (creating) {
    const out = await db.run(`INSERT INTO ${name} (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`, vals);
    return res.status(201).json({ id: out.id });
  }
  const out = await db.run(`UPDATE ${name} SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE ${r.pk} = ?`, [...vals, id]);
  if (!out.changes) throw new HttpError(404, 'Registro no encontrado.');
  res.json({ id });
}

app.post('/api/:res', wrap((req, res) => save(req, res, true)));
app.put('/api/:res/:id', wrap((req, res) => save(req, res, false)));

app.delete('/api/:res/:id', wrap(async (req, res) => {
  const r = find(req.params.res);
  const out = await db.run(`DELETE FROM ${req.params.res} WHERE ${r.pk} = ?`, [idOf(req)]);
  if (!out.changes) throw new HttpError(404, 'Registro no encontrado.');
  res.status(204).end();
}));

app.use('/api', (_req, res) => res.status(404).json({ error: 'Ruta no encontrada.' }));

if (existsSync('dist')) app.get('*', (_req, res) => res.sendFile('dist/index.html', { root: process.cwd() }));

const port = Number(process.env.PORT || 3000);
app.listen(port, () => console.log(`EcoRAEE Cloud en el puerto ${port} (base: ${driver}, archivos: ${storage})`));
