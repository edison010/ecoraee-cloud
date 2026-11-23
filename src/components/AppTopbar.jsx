function BrandMark() {
  return <span className="brand-mark" aria-hidden="true" />;
}

export default function AppTopbar({ resources, route, collapsed, onToggleMenu }) {
  const tabs = [
    { name: 'panel', label: 'Panel', routes: ['panel'] },
    { name: 'lote', label: resources?.lote?.title ?? 'Lotes', routes: ['lote'] },
    { name: 'dispositivo', label: resources?.dispositivo?.title ?? 'Dispositivos', routes: ['dispositivo', 'evaluacion', 'tratamiento', 'evidencia'] },
    { name: 'traslado', label: resources?.traslado?.title ?? 'Traslados', routes: ['traslado'] },
    { name: 'ruta', label: 'Red', routes: ['organizacion', 'sede', 'ruta'] },
  ];

  return (
    <header className="app-topbar">
      <div className="brand-row">
        <button type="button" className="menu-toggle" onClick={onToggleMenu} aria-expanded={!collapsed} aria-controls="side-navigation" title={collapsed ? 'Mostrar menú' : 'Ocultar menú'} aria-label={collapsed ? 'Mostrar menú' : 'Ocultar menú'}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
        </button>
        <a className="brand" href="#/panel"><BrandMark />EcoRAEE <span>Cloud</span></a>
      </div>
      <nav className="section-tabs" aria-label="Secciones">
        {tabs.map((tab) => <a className="section-tab" href={`#/${tab.name}`} aria-current={tab.routes.includes(route) ? 'page' : undefined} key={tab.name}>{tab.label}</a>)}
      </nav>
    </header>
  );
}
