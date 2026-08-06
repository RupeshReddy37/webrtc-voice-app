// src/pages/HomePage.jsx
// ARV branded dashboard: hero + three launch cards.
import { Link } from 'react-router-dom';

const FEATURES = [
  {
    to: '/audio',
    icon: '🎙️',
    title: 'Audio Call',
    desc: 'Crystal-clear 1-on-1 voice calls with a live waveform visualizer. Just share a room code.',
    accent: 'audio',
  },
  {
    to: '/video',
    icon: '📹',
    title: 'Video Call',
    desc: 'Widescreen HD video stage with a floating self-view picture-in-picture and transparent controls.',
    accent: 'video',
  },
  {
    to: '/chat',
    icon: '💬',
    title: 'Text Chat',
    desc: 'Private peer-to-peer messaging over WebRTC data channels - no servers store your words.',
    accent: 'chat',
  },
];

export default function HomePage() {
  return (
    <section className="page home">
      <div className="hero">
        <span className="hero-badge">1-on-1 · WebRTC · Peer-to-Peer</span>
        <h1 className="hero-title">
          <span className="grad">ARV</span>
        </h1>
        <h2 className="hero-sub">Audio or Video</h2>
        <p className="hero-tag">
          Pick a mode, share a room code, and connect. Your media streams
          directly between peers - it never touches our servers.
        </p>
      </div>

      <div className="cards">
        {FEATURES.map((f) => (
          <Link key={f.to} to={f.to} className={`card card-${f.accent}`}>
            <span className="card-icon">{f.icon}</span>
            <h3 className="card-title">{f.title}</h3>
            <p className="card-desc">{f.desc}</p>
            <span className="card-go" aria-hidden="true">
              →
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
