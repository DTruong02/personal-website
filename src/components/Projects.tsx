import React from 'react';
import { EmblaOptionsType } from 'embla-carousel';
import EmblaCarousel from './EmblaCarousel';
import './Projects.css';
import Code1580 from '../assets/Code_1580.png';
import Project_2048 from '../assets/Project_2048.png';
import Chat_app from '../assets/Chat_app.png';
import MLB from '../assets/MLB.png';
import Webcam from '../assets/Webcam.png';

const OPTIONS: EmblaOptionsType = { loop: true };

const PROJECTS = [
  {
    title: 'Algorithmic Trading Bot',
    description: [
      'Automated trading on S&P and NASDAQ via NinjaTrader C#.',
      'Custom tick granularity and brokerage integrations.',
      'Exploring sentiment analysis with news APIs.',
    ],
    imageUrl: Code1580,
  },
  {
    title: 'Real-time Chat Application',
    description: [
      'MERN stack chat with WebSocket messaging.',
      'Containerized with Docker for consistent deploys.',
    ],
    hyperlink: 'https://react-chat-app-delta-eight.vercel.app/',
    imageUrl: Chat_app,
  },
  {
    title: '2048 Clone',
    description: [
      'React Native + TypeScript clone of 2048.',
      'Gesture Handler for smooth swipe controls.',
    ],
    hyperlink: 'https://react-native-web-2048-clone.vercel.app/',
    imageUrl: Project_2048,
  },
  {
    title: 'Webcam Gesture Controller',
    description: [
      'OpenCV + MediaPipe gesture mapping to actions.',
      'Controls Govee lamps and media playback over LAN/cloud.',
    ],
    hyperlink: 'https://github.com/DTruong02/webcam_gesture_control',
    imageUrl: Webcam,
  },
  {
    title: 'Baseball Prediction Model',
    description: [
      'Python + scikit-learn game outcome predictions.',
      'OpenAI / Ollama LLMs with MLB and FanGraphs data.',
    ],
    hyperlink: 'https://github.com/DTruong02/baseball-match-prediction',
    imageUrl: MLB,
  },
];

function Projects() {
  return (
    <section className="projects-section section-pad" id="projects">
      <h2 className="section-title">projects</h2>
      <p className="section-lede">Selected work — swipe or use the controls to browse.</p>
      <EmblaCarousel slides={PROJECTS} options={OPTIONS} />
    </section>
  );
}

export default Projects;
