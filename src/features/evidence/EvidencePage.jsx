import { useEffect, useState } from 'react';
import LoadError from '../../components/LoadError.jsx';
import { ListSkeleton } from '../../components/LoadingSkeletons.jsx';
import PageHeader from '../../components/PageHeader.jsx';
import { api, fileUrl } from '../../services/api.js';
import { formatDate, pretty } from '../../utils/format.js';

const isImage = (url) => /\.(jpe?g|png|webp)$/i.test(url);

export default function EvidencePage({ onTrace }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setRows(null); setError('');
    api('evidencia', { signal: controller.signal })
      .then(setRows)
      .catch((err) => { if (err.name !== 'AbortError') setError(err.message); });
    return () => controller.abort();
  }, [retry]);

  if (error) return <div><PageHeader title="Evidencias" /><LoadError message={error} onRetry={() => setRetry((n) => n + 1)} /></div>;
  if (!rows) return <ListSkeleton />;

  return (
    <div>
      <PageHeader title="Evidencias" description="Fotos, actas y certificados de cada movimiento. Para subir una, abre la trazabilidad del dispositivo." />
      {rows.length ? (
        <ul className="evidence-list">
          {rows.map((row) => (
            <li key={row.id_evidencia}>
              <a className="evidence-card" href={fileUrl(row.id_evidencia)} target="_blank" rel="noreferrer">
                <span className="evidence-thumb">
                  {isImage(row.url_archivo) ? <img src={fileUrl(row.id_evidencia)} alt={`${pretty(row.tipo)} de ${row.codigo}`} loading="lazy" onError={(e) => { e.currentTarget.replaceWith(pretty(row.tipo)); }} /> : pretty(row.tipo)}
                </span>
                <span className="evidence-meta">
                  <strong>{pretty(row.tipo)}</strong>
                  <span className="code">{row.codigo}</span>
                  <small>{pretty(row.estado_nuevo)}, {formatDate(row.fecha_carga)}</small>
                </span>
              </a>
              <button type="button" className="text-link" onClick={() => onTrace(row.id_dispositivo)}>Ver trazabilidad</button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="empty-state"><strong>Aún no hay evidencias</strong><span>Abre la trazabilidad de un dispositivo y adjunta una foto o un PDF a uno de sus movimientos.</span></div>
      )}
    </div>
  );
}
