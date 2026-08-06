// src/components/TopNavbar.jsx
// Fixed top header navigation, present on every page.
// Left: Verge branding. Center: route links. Right: connection status.
import { NavLink } from 'react-router-dom';
import { useSocketStatus } from '../hooks/useSocketStatus';
import { HomeIcon, MicIcon, CameraIcon, ChatIcon, ZapIcon } from './icons';

const LINKS = [
  { to: '/', label: 'Home', icon: HomeIcon, end: true },
  { to: '/audio', label: 'Audio', icon: MicIcon },
  { to: '/video', label: 'Video', icon: CameraIcon },
  { to: '/chat', label: 'Chat', icon: ChatIcon },
];

export default function TopNavbar() {
  const connected = useSocketStatus();

  return (
    <header className="top-nav">
      <NavLink to="/" className="brand" end aria-label="Verge home">
        <span className="brand-mark">
          <ZapIcon className="icon" />
        </span>
        <span className="brand-text">Verge</span>
      </NavLink>

      <nav className="nav-links" aria-label="Primary">
        {LINKS.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
          >
            <Icon className="icon" />
            <span className="nav-label">{label}</span>
          </NavLink>
        ))}
      </nav>

      <div
        className="nav-right"
        title={connected ? 'Signaling server connected' : 'Signaling server disconnected'}
      >
        <span className={`conn-dot${connected ? ' on' : ''}`} />
        <span className="conn-text">{connected ? 'Connected' : 'Disconnected'}</span>
      </div>
    </header>
  );
}

