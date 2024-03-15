import React from 'react'
import { Typewriter } from 'react-simple-typewriter'
import './Hero.css';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faLinkedinIn, faGithub } from '@fortawesome/free-brands-svg-icons'
import heroVideo from '../public/videos/video.mp4';


function Hero() {
  return (
    <>
      <head>
        <script src="https://kit.fontawesome.com/4e3aea9a30.js" crossOrigin="anonymous"></script>
      </head>
      <header className='hero-container'>
        <video autoPlay loop muted/>
          <source src={heroVideo} type='video/mp4'/>
        <div className='left-overlay'></div>
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
              <span className='icon'>
                <FontAwesomeIcon icon={faLinkedinIn}/>
              </span>

            </a>
            <a href="https://www.github.com">
              <span className='icon'>
                <FontAwesomeIcon icon={faGithub}/>
              </span>
            </a>
          </div>
      </header>
    </>
  )
}

export default Hero
