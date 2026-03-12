import EmblaCarousel from "./EmblaCarousel";
import {EmblaOptionsType} from "embla-carousel";
import './Projects.css';
import Code1580 from '../assets/Code_1580.png';
import Project_2048 from '../assets/Project_2048.png';
import Chat_app from '../assets/Chat_app.png';


const OPTIONS: EmblaOptionsType = { loop: true }
const SLIDE_COUNT = 2
const SLIDES = Array.from({ length: SLIDE_COUNT }, (_, i) => i)

const PROJECTS = [
    {
        title: "Algorithmic Trading Bot",
        description: ["Automated trading bot for stock market analysis on S&P and NASDAQ", "Built on NinjaTrader's C# event-driven framework with custom tick granularity for the most precise analysis", "Integrated with major brokerage platforms", "Working on sentiment analysis using external news APIs"],
        
        imageUrl: Code1580
    },
    {
        title: "Real-time Chat Application",
        description: ["Real-time chat application built on the MERN stack", "Uses WebSocket for real-time communication", "Containerized with Docker for easy consistent deployment"],
        hyperlink: "https://react-chat-app-delta-eight.vercel.app/",
        imageUrl: Chat_app
    },
    {
        title: "2048 Clone",
        description: ["PoC clone of the popular 2048 game", "Built with React Native on Typescript", "Uses React Native Gesture Handler for smooth swipe controls"],
        hyperlink: "https://react-native-web-2048-clone.vercel.app/",
        imageUrl: Project_2048
    },

]

function Projects() {
    return (
        <section className="projects-section" id="projects">
            <div className='project-left-overlay'>
                <div className="overlay-text">Projects</div>
            </div>
            <EmblaCarousel slides={PROJECTS} options={OPTIONS} />
        </section>
    )
}

export default Projects;