import React from 'react';
import './About.css';

const intro = [
  "Hey, I'm Danny — a new grad from the University of Waterloo.",
  'I graduated in August 2025 with a BMath in Computational Mathematics. I care about software that is clear, useful, and thoughtfully built.',
];

const hobbies = [
  'Outside of programming I like games, the gym, and TV.',
  'Currently watching: Brooklyn 99, The Witcher, The Bear.',
];

const experience = [
  'Worked with Solution Architects on infrastructure solutions, system design diagrams, and PoCs.',
  'Built API endpoint monitoring infrastructure and managed deployment with Terraform.',
  'Developed data pipelines for internal analytics and reporting with Python and SQL.',
];

function About() {
  return (
    <section className="about-section section-pad" id="about">
      <h2 className="section-title">about</h2>
      <p className="section-lede">A short sketch of who I am and what I&apos;ve been working on.</p>

      <div className="about-grid">
        <div className="about-block">
          <h3 className="about-block-title">intro</h3>
          {intro.map((line) => (
            <p key={line} className="about-copy">
              {line}
            </p>
          ))}
        </div>

        <div className="about-block">
          <h3 className="about-block-title">hobbies</h3>
          {hobbies.map((line) => (
            <p key={line} className="about-copy">
              {line}
            </p>
          ))}
        </div>

        <div className="about-block about-block-wide">
          <h3 className="about-block-title">recent work</h3>
          <p className="about-role">Application Engineer @ Purolator</p>
          <ul className="about-list">
            {experience.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

export default About;
