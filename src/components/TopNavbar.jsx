// src/components/TopNavbar.jsx
// Fixed top header navigation, present on every page.
// Left: ARV branding. Center: route links. Right: connection status.
import { NavLink } from 'react-router-dom';
import { useSocketStatus } from '../hooks/useSocketStatus';

const LINKS = [
  { to: '/', label: 'Home', icon: '🏠', end: true },
  { to: '/audio', label: 'Audio', icon: '🎙️' },
  { to: '/video', label: 'Video', icon: '📹' },
  { to: '/chat', label: 'Chat', icon: '💬' },
];

export default function TopNavbar() {
  const connected = useSocketStatus();

  return (
    <header className="top-nav">
      <NavLink to="/" className="brand" end aria-label="ARV home">
        <span className="brand-mark">ARV</span>
        <span className="brand-text">Audio or Video</span>
      </NavLink>

      <nav className="nav-links" aria-label="Primary">
        {LINKS.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            end={link.end}
            className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
          >
            <span className="nav-icon">{link.icon}</span>
            <span className="nav-label">{link.label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="nav-right" title={connected ? 'Signaling server connected' : 'Signaling server disconnected'}>
        <span className={`conn-dot${connected ? ' on' : ''}`} />
        <span className="conn-text">{connected ? 'Connected' : 'Disconnected'}</span>
      </div>
    </header>
  );
}
