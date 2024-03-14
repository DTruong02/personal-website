import React from 'react'
import { Typewriter, useTypewriter } from 'react-simple-typewriter'
import './Hero.css';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faLinkedinIn, faGithub } from '@fortawesome/free-brands-svg-icons'


function Hero() {
  return (
    <>
      <head>
      <script src="https://kit.fontawesome.com/4e3aea9a30.js" crossOrigin="anonymous"></script>
      </head>
      <header className='hero-container'>
        <div className="intro">
          <h3>Hello, my name is</h3>
          <h1>Danny Truong.</h1>
          <p>
            I'm a <span><Typewriter
                          words = {['programmer', 'developer', 'designer', 'student', 'learner']} 
                          loop = {0} 
                          cursor = {true}
                          cursorBlinking = {true}/>
                  </span>
          </p>
        </div>
        <div className='icons'>
          <a href="https://www.linkedin.com/in/dtruong02/">
            <FontAwesomeIcon icon={faLinkedinIn}/>
          </a>
          <a href="">
            <FontAwesomeIcon icon={faGithub}/>
          </a>
        </div>
      </header>
    </>
  )
}

export default Hero
