import { useEffect, useState } from 'react';
import { DashboardSkeleton } from '../../components/LoadingSkeletons.jsx';
import LoadError from '../../components/LoadError.jsx';
import PageHeader from '../../components/PageHeader.jsx';
import StatusText from '../../components/StatusText.jsx';
import { api } from '../../services/api.js';
import { formatDate, formatNumber } from '../../utils/format.js';

const STAGES = [
  ['REGISTRADO'],
  ['RECIBIDO'],
  ['EVALUADO'],
  ['EN_TRATAMIENTO'],
  ['REACONDICIONADO', 'RECICLADO', 'DISPUESTO', 'DONADO'],
  ['CERRADO'],
];
const STAGE_NAMES = ['Registrado', 'Recibido', 'Evaluado', 'En tratamiento', 'Resultado', 'Cerrado'];

// El recorrido: cada tramo de la barra mide la parte de los equipos que está en esa etapa.
function Journey({ counts, total }) {
  const stages = STAGES.map((states, i) => ({
    name: STAGE_NAMES[i],
    count: states.reduce((sum, state) => sum + Number(counts[state] || 0), 0),
  }));
  return (
    <section className="journey" aria-labelledby="journey-title">
      <div className="card-heading">
        <h2 id="journey-title">Dónde está cada equipo</h2>
        <a className="text-link" href="#/dispositivo">Ver dispositivos</a>
      </div>
      <div className="journey-bar" aria-hidden="true">
        {stages.map((stage, i) => stage.count > 0 && (
          <span className={`journey-seg s${i}`} key={stage.name} style={{ '--share': stage.count / Math.max(total, 1), '--i': i }} />
        ))}
      </div>
      <ol className="journey-stages">
        {stages.map((stage, i) => (
          <li className={`s${i}${stage.count ? '' : ' empty'}`} key={stage.name}>
            <span className="journey-num">{i + 1}</span>
            <strong>{stage.count}</strong>
            <span>{stage.name}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function CategoryWeights({ categories }) {
  const maxKg = Math.max(1, ...categories.map((item) => Number(item.kg) || 0));
  return (
    <section className="dashboard-card" aria-labelledby="categories-title">
      <div className="card-heading"><h2 id="categories-title">Peso por categoría</h2></div>
      {categories.length ? (
        <ul className="bar-list">
          {categories.map((item) => {
            const kg = Number(item.kg) || 0;
            return <li className="bar-row" key={item.nombre}>
              <span className="bar-label">{item.nombre}</span>
              <small>{formatNumber(kg)} kg, {item.n} equipo{Number(item.n) === 1 ? '' : 's'}</small>
              <span className="bar-track" aria-label={`${formatNumber(kg)} kg`}><i style={{ '--bar-width': `${Math.max(0, Math.min(100, kg / maxKg * 100))}%` }} /></span>
            </li>;
          })}
        </ul>
      ) : <p className="empty-inline">Aún no hay dispositivos registrados.</p>}
    </section>
  );
}

function RouteCapacity({ routes }) {
  return (
    <section className="dashboard-card" aria-labelledby="routes-title">
      <div className="card-heading"><h2 id="routes-title">Capacidad de rutas</h2><a className="text-link" href="#/ruta">Ver rutas</a></div>
      {routes.length ? (
        <ul className="bar-list">
          {routes.map((route) => {
            const capacity = Number(route.capacidad) || 0;
            const assigned = Number(route.asignado) || 0;
            const percent = capacity > 0 ? Math.min(100, assigned / capacity * 100) : 0;
            return <li className="bar-row" key={route.id_ruta}>
              <span className="bar-label">{route.origen} <span aria-hidden="true">→</span> {route.destino}</span>
              <small>{formatNumber(assigned)} de {formatNumber(capacity)} kg</small>
              <span className="bar-track" aria-label={`${formatNumber(percent)}% de capacidad`}><i className={percent > 80 ? 'hot' : ''} style={{ '--bar-width': `${percent}%` }} /></span>
            </li>;
          })}
        </ul>
      ) : <p className="empty-inline">No hay rutas activas.</p>}
    </section>
  );
}

function RecentActivity({ events, onTrace }) {
  const recentEvents = events.slice(0, 4);
  return (
    <section className="dashboard-card" aria-labelledby="activity-title">
      <div className="card-heading"><h2 id="activity-title">Últimos movimientos</h2><a className="text-link" href="#/dispositivo">Ver dispositivos</a></div>
      {recentEvents.length ? (
        <ul className="activity-list">
          {recentEvents.map((event) => (
            <li className="activity-item" key={`${event.id_dispositivo}-${event.fecha_hora}-${event.estado_nuevo}`}>
              <div className="activity-main">
                <button type="button" className="linkish code" onClick={() => onTrace?.(event.id_dispositivo)}>{event.codigo}</button>
                <StatusText value={event.estado_nuevo} tone="auto" />
              </div>
              <small>{formatDate(event.fecha_hora)}, {event.responsable}</small>
              {event.descripcion && <p>{event.descripcion}</p>}
            </li>
          ))}
        </ul>
      ) : <p className="empty-inline">Todavía no hay movimientos.</p>}
    </section>
  );
}

export default function DashboardPage({ onTrace }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setData(null);
    setError('');
    api('dashboard', { signal: controller.signal })
      .then(setData)
      .catch((err) => { if (err.name !== 'AbortError') setError(err.message); });
    return () => controller.abort();
  }, [retry]);

  if (error) return <><PageHeader title="Resumen RAEE" /><LoadError message={error} onRetry={() => setRetry((n) => n + 1)} /></>;
  if (!data) return <DashboardSkeleton />;

  const counts = Object.fromEntries(data.porEstado.map(({ estado, n }) => [estado, Number(n)]));
  return (
    <div className="dashboard-page">
      <PageHeader title="Resumen RAEE" />
      <dl className="metric-strip">
        <div className="metric lead"><dt>Equipos en seguimiento</dt><dd>{formatNumber(data.tot.dispositivos)}</dd></div>
        <div className="metric"><dt>Peso total</dt><dd>{formatNumber(data.tot.kg)} <small>kg</small></dd></div>
        <div className="metric"><dt>Lotes abiertos</dt><dd>{formatNumber(data.tot.lotes_abiertos)}</dd></div>
        <div className="metric"><dt>Traslados pendientes</dt><dd>{formatNumber(data.tot.traslados_pendientes)}</dd></div>
      </dl>
      <Journey counts={counts} total={Number(data.tot.dispositivos)} />
      <div className="dashboard-grid">
        <CategoryWeights categories={data.porCategoria} />
        <RouteCapacity routes={data.rutas} />
        <RecentActivity events={data.eventos} onTrace={onTrace} />
      </div>
    </div>
  );
}
