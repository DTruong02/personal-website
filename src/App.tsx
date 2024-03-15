//import logo from './logo.svg';
import './App.css';
import './test/main.css';
import styled from "styled-components";
import Button from "./components/Button";
import Navbar from "./components/Navbar";
import { BrowserRouter as Router, Route } from 'react-router-dom';
import React from 'react';
import Hero from './components/Hero';

const sectionStyle = {
  backgroundColor: 'orange',
  minHeight: '50vh',
};

function App() {
	return (
		<>
		
		<Router>
			<Navbar/>
      <Hero/>
      <section style={sectionStyle}></section>
			{/*<Switch>
				<Route path='/' exact />
	</Switch>*/}
		</Router>
	
			<link rel="stylesheet" href="src/test/main.css" />
			<link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/4.7.0/css/font-awesome.min.css" rel="stylesheet" />
			{/*
      <nav class="navbar">
        <div className="navbar-container">
          <div >
            <a href="#home" className="navbar-logo">Danny Truong</a>
          </div>
          <div className="navbar-menu">
            <ul className="nav-list">
              <li className="nav-item">
                <a href="#home" className="nav-link">Home</a>
              </li>
              <li className="nav-item" style={{transform: `translate(0px, 0px)`, opacity: 1}}>
                <a href="#about" className="nav-link">About</a>
              </li>
              <li className="nav-item" style={{transform: `translate(0px, 0px)`, opacity: 1}}>
                <a href="#projects" className="nav-link">Projects</a>
              </li>
              <li className="nav-item" style={{transform: `translate(0px, 0px)`, opacity: 1}}>
                <a href="#contact" className="nav-link">Contact</a>
              </li>
                
            </ul>
          </div>
        </div>
    
      </nav>
*/}
      
			{/*
      <div class="wrapper">
        <MyButton class="fa fa-tumblr"/>
        <MyButton class="fa fa-reddit"/>
        <MyButton class="fa fa-whatsapp"/>
        <MyButton class="fa fa-telegram"/>
      </div>
  */}
		</>
	);
}

export default App;