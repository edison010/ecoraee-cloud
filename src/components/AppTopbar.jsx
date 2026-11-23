function BrandMark() {
  return <span className="brand-mark" aria-hidden="true" />;
}

export default function AppTopbar({ resources, route, collapsed, onToggleMenu }) {
  // El recorrido de un RAEE, en orden: llega en un lote, se traslada, se registra cada equipo, se evalúa, se trata y se respalda.
  const flow = ['lote', 'traslado', 'dispositivo', 'evaluacion', 'tratamiento', 'evidencia'];
  const tabs = [{ name: 'panel', label: 'Panel' }, ...flow.filter((name) => resources?.[name]).map((name) => ({ name, label: resources[name].title }))];

  return (
    <header className="app-topbar">
      <div className="brand-row">
        <button type="button" className="menu-toggle" onClick={onToggleMenu} aria-pressed={!collapsed} aria-controls="side-navigation" title={collapsed ? 'Fijar menú abierto' : 'Soltar menú'} aria-label={collapsed ? 'Fijar menú abierto' : 'Soltar menú'}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
            <path className="bar top" d="M4 7h16" /><path className="bar mid" d="M4 12h16" /><path className="bar bot" d="M4 17h16" />
          </svg>
        </button>
        <a className="brand" href="#/panel"><BrandMark />EcoRAEE <span>Cloud</span></a>
      </div>
      <nav className="section-tabs" aria-label="Secciones">
        {tabs.map((tab) => <a className="section-tab" href={`#/${tab.name}`} aria-current={tab.name === route ? 'page' : undefined} key={tab.name}>{tab.label}</a>)}
      </nav>
    </header>
  );
}
