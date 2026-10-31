import React, { useEffect, useState } from 'react';
import { useTheme } from '../context/ThemeContext';
import './Navbar.css';

interface NavbarProps {
  onContactClick: () => void;
}

const LINKS = [
  { label: 'home', href: '#home' },
  { label: 'about', href: '#about' },
  { label: 'projects', href: '#projects' },
] as const;

function Navbar({ onContactClick }: Readonly<NavbarProps>) {
  const { theme, toggleTheme } = useTheme();
  const [active, setActive] = useState('home');
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const sections = ['home', 'about', 'projects'];
    const observers: IntersectionObserver[] = [];

    sections.forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      const observer = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) setActive(id);
        },
        { rootMargin: '-40% 0px -50% 0px', threshold: 0 }
      );
      observer.observe(el);
      observers.push(observer);
    });

    return () => observers.forEach((o) => o.disconnect());
  }, []);

  const scrollHome = (event: React.MouseEvent) => {
    event.preventDefault();
    setMenuOpen(false);
    globalThis.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <nav className="navbar" aria-label="Main" data-koi-ignore>
      <button
        type="button"
        className="navbar-menu-toggle"
        aria-expanded={menuOpen}
        aria-label="Toggle menu"
        onClick={() => setMenuOpen((open) => !open)}
      >
        menu
      </button>

      <ul className={`navbar-list${menuOpen ? ' is-open' : ''}`}>
        {LINKS.map(({ label, href }) => (
          <li key={label}>
            <a
              href={href}
              className={`nav-link${active === label ? ' is-active' : ''}`}
              onClick={label === 'home' ? scrollHome : () => setMenuOpen(false)}
            >
              {label}
            </a>
          </li>
        ))}
        <li>
          <button
            type="button"
            className="nav-link nav-link-button"
            onClick={() => {
              setMenuOpen(false);
              onContactClick();
            }}
          >
            contact
          </button>
        </li>
        <li>
          <button
            type="button"
            className="nav-theme"
            onClick={toggleTheme}
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {theme === 'dark' ? 'light' : 'dark'}
          </button>
        </li>
      </ul>
    </nav>
  );
}

export default Navbar;
