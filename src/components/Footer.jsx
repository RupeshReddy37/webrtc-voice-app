// src/components/Footer.jsx
// Professional bottom-anchored footer shown on every page.
import { MailIcon, GlobeIcon } from './icons';

export default function Footer() {
  return (
    <footer className="footer">
      <span className="footer-note">
        Crafted by <strong>Lomada Rupesh Reddy</strong>
      </span>
      <div className="footer-links">
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
          href="https://github.com/RupeshReddy37"
          target="_blank"
          rel="noopener noreferrer"
          title="Open portfolio"
        >
          <GlobeIcon className="icon" />
          Lomada Rupesh Reddy | Java Backend Developer Portfolio
        </a>
      </div>
    </footer>
  );
}
