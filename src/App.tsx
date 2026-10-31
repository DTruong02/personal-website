import React, { useState } from 'react';
import { BrowserRouter as Router } from 'react-router-dom';
import './App.css';
import { ThemeProvider } from './context/ThemeContext';
import Navbar from './components/Navbar';
import Hero from './components/Hero';
import About from './components/About';
import Projects from './components/Projects';
import ContactOverlay from './components/ContactOverlay';

function App() {
  const [isContactOpen, setIsContactOpen] = useState(false);

  return (
    <ThemeProvider>
      <Router basename={process.env.PUBLIC_URL}>
        <div className="app-shell">
          <Navbar onContactClick={() => setIsContactOpen(true)} />
          <Hero />
          <About />
          <Projects />
          <ContactOverlay
            isOpen={isContactOpen}
            onClose={() => setIsContactOpen(false)}
          />
        </div>
      </Router>
    </ThemeProvider>
  );
}

export default App;
