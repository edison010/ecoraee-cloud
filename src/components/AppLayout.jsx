import { useEffect, useRef, useState } from 'react';
import AppTopbar from './AppTopbar.jsx';
import SideNavigation from './SideNavigation.jsx';

export default function AppLayout({ resources, route, children }) {
  const mainRef = useRef(null);
  // El menú muestra solo íconos y se abre al pasar el mouse. Con un clic en el botón se bloquea y queda quieto.
  const [locked, setLocked] = useState(() => {
    try { return localStorage.getItem('eco-menu-bloqueado') === 'si'; } catch { return false; }
  });
  const toggleMenu = () => setLocked((value) => {
    try { localStorage.setItem('eco-menu-bloqueado', value ? 'no' : 'si'); } catch { /* sin almacenamiento */ }
    return !value;
  });

  useEffect(() => {
    mainRef.current?.focus({ preventScroll: true });
  }, [route]);

  return (
    <div className={`app-shell nav-collapsed${locked ? ' nav-locked' : ''}`}>
      <a className="skip-link" href="#main">Saltar al contenido</a>
      <AppTopbar resources={resources} route={route} locked={locked} onToggleMenu={toggleMenu} />
      <SideNavigation resources={resources} route={route} />
      <main id="main" ref={mainRef} tabIndex={-1} className="main-content">{children}</main>
    </div>
  );
}
