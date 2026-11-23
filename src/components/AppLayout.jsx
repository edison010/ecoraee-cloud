import { useEffect, useRef, useState } from 'react';
import AppTopbar from './AppTopbar.jsx';
import SideNavigation from './SideNavigation.jsx';

export default function AppLayout({ resources, route, children }) {
  const mainRef = useRef(null);
  // Por defecto el menú muestra solo íconos y se abre al pasar el mouse; con un clic queda fijo.
  const [pinned, setPinned] = useState(() => {
    try { return localStorage.getItem('eco-menu-fijo') === 'si'; } catch { return false; }
  });
  const toggleMenu = () => setPinned((value) => {
    try { localStorage.setItem('eco-menu-fijo', value ? 'no' : 'si'); } catch { /* sin almacenamiento */ }
    return !value;
  });
  const collapsed = !pinned;

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
