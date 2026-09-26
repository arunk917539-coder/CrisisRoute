import React, { useState } from 'react';
import { NavLink, Link } from 'react-router-dom';

export const Header: React.FC = () => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const closeMenu = () => setIsMobileMenuOpen(false);

  return (
    <header className="site-header">
      {/* Emergency Notice Ribbon */}
      <div className="emergency-ribbon">
        <div className="container ribbon-inner">
          <span className="ribbon-alert-icon">⚠️</span>
          <span>
            <strong>Immediate Threat?</strong> If lives are in critical danger, call emergency services directly: <strong>911 / 112 / local dispatch</strong>.
          </span>
        </div>
      </div>

      {/* Main Navigation Bar */}
      <div className="container nav-container">
        <div className="brand-group">
          <Link to="/" className="brand-link" onClick={closeMenu}>
            <div className="brand-icon-wrapper">
              <span className="brand-icon">🚨</span>
            </div>
            <div className="brand-text">
              <span className="brand-title">CrisisRoute</span>
              <span className="brand-badge">Citizen Portal</span>
            </div>
          </Link>
        </div>

        {/* Mobile menu toggle */}
        <button
          type="button"
          className="mobile-nav-toggle"
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          aria-expanded={isMobileMenuOpen}
          aria-label="Toggle navigation menu"
        >
          <span className="hamburger-bar" />
          <span className="hamburger-bar" />
          <span className="hamburger-bar" />
        </button>

        {/* Desktop & Mobile Navigation Links */}
        <nav className={`main-nav ${isMobileMenuOpen ? 'nav-open' : ''}`} aria-label="Main Navigation">
          <ul className="nav-list">
            <li className="nav-item">
              <NavLink
                to="/"
                end
                className={({ isActive }) => `nav-link ${isActive ? 'nav-link-active' : ''}`}
                onClick={closeMenu}
              >
                Home
              </NavLink>
            </li>
            <li className="nav-item">
              <NavLink
                to="/request-help"
                className={({ isActive }) => `nav-link ${isActive ? 'nav-link-active' : ''}`}
                onClick={closeMenu}
              >
                Request Help
              </NavLink>
            </li>
            <li className="nav-item">
              <NavLink
                to="/track"
                className={({ isActive }) => `nav-link ${isActive ? 'nav-link-active' : ''}`}
                onClick={closeMenu}
              >
                Track Request
              </NavLink>
            </li>
          </ul>
        </nav>
      </div>
    </header>
  );
};
