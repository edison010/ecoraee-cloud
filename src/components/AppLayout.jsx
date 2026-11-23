import { useEffect, useRef, useState } from 'react';
import AppTopbar from './AppTopbar.jsx';
import SideNavigation from './SideNavigation.jsx';

export default function AppLayout({ resources, route, children }) {
  const mainRef = useRef(null);
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem('eco-menu') === 'cerrado'; } catch { return false; }
  });
  const toggleMenu = () => setCollapsed((value) => {
    try { localStorage.setItem('eco-menu', value ? 'abierto' : 'cerrado'); } catch { /* sin almacenamiento */ }
    return !value;
  });

  useEffect(() => {
    mainRef.current?.focus({ preventScroll: true });
  }, [route]);

  return (
    <div className={`app-shell${collapsed ? ' nav-collapsed' : ''}`}>
      <a className="skip-link" href="#main">Saltar al contenido</a>
      <AppTopbar resources={resources} route={route} collapsed={collapsed} onToggleMenu={toggleMenu} />
      <SideNavigation resources={resources} route={route} />
      <main id="main" ref={mainRef} tabIndex={-1} className="main-content">{children}</main>
    </div>
  );
}
