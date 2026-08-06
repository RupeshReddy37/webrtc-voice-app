// src/components/Footer.jsx
// Redesigned professional footer - bottom anchored on every page.
// Balanced two-column layout: brand tagline left, credit + links right.
import { MailIcon, GlobeIcon } from './icons';

export default function Footer() {
  return (
    <footer className="footer">
      <span className="footer-brand">
        © 2026 Verge.
      </span>

      <div className="footer-meta">
        <span className="footer-credit">
          Developed by <strong>Rupesh Reddy Lomada</strong>
        </span>
        <a
          className="footer-link"
          href="mailto:rupeshreddylomada@gmail.com"
          title="Send an email"
        >
          <MailIcon className="icon" />
          rupeshreddylomada@gmail.com
        </a>
        <a
          className="footer-link"
          href="https://rupeshreddy.vercel.app/"
          target="_blank"
          rel="noopener noreferrer"
          title="Open portfolio"
        >
          <GlobeIcon className="icon" />
          Portfolio
        </a>
      </div>
    </footer>
  );
}

