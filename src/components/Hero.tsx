import React from 'react';
import { Typewriter } from 'react-simple-typewriter';
import { KoiPond } from './koi-pond';
import './Hero.css';

function Hero() {
  return (
    <header className="hero" id="home">
      <KoiPond className="hero-pond" />
      <div className="hero-content" data-koi-ignore data-koi-avoid>
        <p className="hero-greeting">Hello, my name is</p>
        <h1 className="hero-name">Danny Truong.</h1>
        <p className="hero-typewriter">
          I&apos;m a{' '}
          <span className="hero-typewriter-word">
            <Typewriter
              words={['programmer', 'developer', 'designer', 'student', 'learner']}
              loop={0}
              cursor
              cursorBlinking
            />
          </span>
        </p>
        <p className="hero-socials">
          <a
            className="ink-link"
            href="https://github.com/DTruong02"
            target="_blank"
            rel="noopener noreferrer"
          >
            github
          </a>
          <span className="hero-socials-sep" aria-hidden="true">
            {' / '}
          </span>
          <a
            className="ink-link"
            href="https://www.linkedin.com/in/dtruong02/"
            target="_blank"
            rel="noopener noreferrer"
          >
            linkedin
          </a>
        </p>
      </div>
    </header>
  );
}

export default Hero;
