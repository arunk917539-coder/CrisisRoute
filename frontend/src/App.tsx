import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { LocationProvider } from './context/LocationContext';
import { Header } from './components/Header';
import { Footer } from './components/Footer';
import { HomePage } from './pages/HomePage';
import { RequestHelpPage } from './pages/RequestHelpPage';
import { TrackRequestPage } from './pages/TrackRequestPage';

export const App: React.FC = () => {
  return (
    <BrowserRouter>
      <LocationProvider>
        <div className="app-shell">
          <Header />
          <main className="main-content">
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/request-help" element={<RequestHelpPage />} />
              <Route path="/track" element={<TrackRequestPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </main>
          <Footer />
        </div>
      </LocationProvider>
    </BrowserRouter>
  );
};
export default App;
