import {useSpring, animated, easings } from 'react-spring'
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import './Navbar.css'

/*
const OnHover = ({ timing = 150, children }) => {
	const [hovered, setHovered] = useState(false);

	const style = useSpring({
        marginRight: '0.5rem',
        animation: 'fadeInTop ease 0.5s both',
        from: { opacity: 0 },
        to: { opacity: 1}, 
		display: 'inline-block',
		content: '',
		bottom: '-2px',
		left: '50%',
		position: 'absolute',
		width: '100%',
		height: '30px',
		backgroundColor: 'black',
		pointerEvents: 'pointer',
		config: {
			easing: easings.easeInCubic(0.25, 0.8, 0.25, 1)
		},
		
	});

	React.useEffect(() => {
		if (!hovered) {
			return;
		}

		const timeoutId = window.setTimeout(() => {
			setHovered(false);
		}, timing);

		return () => {
			window.clearTimeout(timeoutId);
		};

	}, [hovered, timing]);

	const trigger = () => {
		setHovered(true);
	};

	return (
		<animated.li onMouseEnter={trigger}

					className={"li-style"}>
		{children} </animated.li>
	)
};
*/
function Navbar() {
	return (
		<>
			<nav class="navbar">
				<div className="navbar-container">
					<Link to="/" className="navbar-logo">
						Danny Truong
					</Link>

{
					/*
					<div>
						<a href="#home" className="navbar-logo">Danny Truong</a>
					</div>
					*/
}
					<div className="navbar-menu">
						<ul className="nav-list">
							<li className="li-style">
								<a href="#home" className="nav-link">Home</a>
							</li>
							<li className="li-style">
								<a href="#about" className="nav-link">About</a>
								</li>
							<li className="li-style">
								<a href="#projects" className="nav-link">Projects</a>
								</li>
							<li className="li-style">
								<a href="#contact" className="nav-link">Contact</a>
								</li>

						</ul>
					</div>
				</div>

			</nav>
		</>
	)
}

export default Navbar