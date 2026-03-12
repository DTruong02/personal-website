import './App.css';
import './test/main.css';
import Navbar from "./components/Navbar";
import { BrowserRouter as Router } from 'react-router-dom';
import React, { useState } from 'react';
import Hero from './components/Hero';
import About from './components/About';
import Projects from './components/Projects';
import ContactOverlay from './components/ContactOverlay';



function App() {
  const [isContactOpen, setIsContactOpen] = useState(false);

	return (
		<>
		
		<Router>
      <Navbar onContactClick={() => setIsContactOpen(true)} />
      <Hero/>
      <About/>
      <Projects/>
      <ContactOverlay isOpen={isContactOpen} onClose={() => setIsContactOpen(false)} />
		</Router>
	
			<link rel="stylesheet" href="src/test/main.css" />
			<link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/4.7.0/css/font-awesome.min.css" rel="stylesheet" />
		</>
	);
}

export default App;