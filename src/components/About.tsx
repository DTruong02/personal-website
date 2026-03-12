import React from 'react';
import './About.css';

interface CardData {
  title: string;
  content: string[];
}

const infoCards: CardData[] = [
  { title: 'Intro', content: ['Hey, I\'m Danny, I\'m a new grad coming from the University of Waterloo. ', 'I graduated in August 2025 with a Bachelor\'s degree in Mathematics with a major in Computational Mathematics. \
                            I\'m passionate about software development, and I\'m always eager to learn new technologies and improve my skills. \
                            '] },
  { title: 'Hobbies', content: ['Outside of programming, I enjoy playing video games, going to the gym, and watching TV shows.', 'Current Watch list:', ' - Brooklyn 99', ' - The Witcher', ' - The Bear'] },
];

const experienceCard = [' - Worked under Solution Architects to develop infrastructure solutions that included system design diagrams and PoC\'s', 
                        ' - Developed infrastructure solution for API endpoint monitoring and managed deployment through Terraform',
                        ' - Worked on data pipeline development for internal data analytics and reporting using Python and SQL',]
function About() {
  return (
    <section className="about-section" id="about">
      <h2>About Me</h2>
      <div className="cards">
        {infoCards.map(card => (
          <div key={card.title} className="card">
            <h3 className="card-title">{card.title}</h3>
            <p>
              {card.content.map((line, index) => (
                    <p className="slide-description" key={`${card.title}-${index}`}>
                      {line}
                    </p>
              ))}
            </p>
          </div>
        ))}
      </div>
      <div className="experience-card">Most Recent Work Experience: Application Engineer @ Purolator
        <div>
          {experienceCard.map((line) => (
            <p className="experience-description">
              {line}
            </p>
          ))}

        </div>
      </div>
    </section>
  );
}

export default About;
