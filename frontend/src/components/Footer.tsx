import React from 'react';
import { Link } from 'react-router-dom';

export const Footer: React.FC = () => {
  return (
    <footer className="site-footer">
      <div className="container footer-container">
        <div className="footer-col brand-col">
          <div className="footer-brand">
            <span className="brand-icon">🚨</span>
            <span className="brand-name">CrisisRoute</span>
          </div>
          <p className="footer-description">
            A public crisis coordination platform designed to help affected citizens report emergency situations,
            pinpoint their location, and communicate verified relief needs directly to authorized response coordinators.
          </p>
          <span className="footer-status-pill">
            Citizen Public Experience &bull; Build for Billions Hackathon
          </span>
        </div>

        <div className="footer-col">
          <h4 className="footer-heading">Citizen Services</h4>
          <ul className="footer-links">
            <li>
              <Link to="/">Emergency Home &amp; Location</Link>
            </li>
            <li>
              <Link to="/request-help">Submit Assistance Request</Link>
            </li>
            <li>
              <Link to="/track">Track Response Status</Link>
            </li>
          </ul>
        </div>

        <div className="footer-col">
          <h4 className="footer-heading">Safety &amp; Privacy</h4>
          <p className="footer-safety-text">
            Your location and crisis details are used strictly to coordinate humanitarian relief and emergency aid.
            Admin and dispatch records remain protected under responder protocol.
          </p>
          <p className="footer-safety-notice">
            In imminent danger, always dial local emergency dispatch (911 / 112).
          </p>
        </div>
      </div>

      <div className="footer-bottom">
        <div className="container footer-bottom-inner">
          <small>&copy; {new Date().getFullYear()} CrisisRoute. Built for crisis resilience.</small>
          <small className="footer-env-text">Client Mode: Public Citizen Frontend</small>
        </div>
      </div>
    </footer>
  );
};
