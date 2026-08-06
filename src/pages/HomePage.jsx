// src/pages/HomePage.jsx
// Verge branded dashboard: hero, feature highlights, and launch cards.
import { Link } from 'react-router-dom';
import {
  MicIcon,
  CameraIcon,
  ChatIcon,
  ShieldIcon,
  NetworkIcon,
  MonitorIcon,
  ArrowRightIcon,
} from '../components/icons';

const FEATURES = [
  { icon: MonitorIcon, label: 'High-Definition Video Calls' },
  { icon: ShieldIcon, label: 'Encrypted Secure Connection' },
  { icon: NetworkIcon, label: 'Direct Peer-to-Peer · No data stored on servers' },
];

const MODES = [
  {
    to: '/audio',
    icon: MicIcon,
    title: 'Audio Call',
    desc: 'Crystal-clear 1-on-1 voice calls with a live waveform visualizer. Share a room code and connect in seconds.',
  },
  {
    to: '/video',
    icon: CameraIcon,
    title: 'Video Call',
    desc: 'High-definition 1-on-1 video with a widescreen stage and a floating self-view picture-in-picture.',
  },
  {
    to: '/chat',
    icon: ChatIcon,
    title: 'Text Chat',
    desc: 'Private peer-to-peer messaging over encrypted WebRTC data channels — nothing is stored on our servers.',
  },
];

export default function HomePage() {
  return (
    <section className="page home">
      <div className="hero">
        <span className="hero-badge">Verge · 1-on-1 WebRTC Calling</span>
        <h1 className="hero-title">
          <span className="grad">Verge</span>
        </h1>
        <h2 className="hero-sub">Audio or Video</h2>
        <p className="hero-tag">
          High-definition, secure calls that connect you directly to the person
          you are talking to — no intermediaries, no stored data, just a room
          code to share.
        </p>

        <div className="features">
          {FEATURES.map(({ icon: Icon, label }) => (
            <span key={label} className="feature">
              <Icon className="icon" />
              {label}
            </span>
          ))}
        </div>
      </div>

      <div className="cards">
        {MODES.map(({ to, icon: Icon, title, desc }) => (
          <Link key={to} to={to} className="card">
            <span className="card-icon">
              <Icon className="icon" />
            </span>
            <h3 className="card-title">{title}</h3>
            <p className="card-desc">{desc}</p>
            <span className="card-go">
              <ArrowRightIcon className="icon" />
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

