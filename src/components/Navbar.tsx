import React from 'react';
import { Link } from 'react-router-dom';
import './Navbar.css'

interface NavbarProps {
	onContactClick: () => void;
}
function Navbar({ onContactClick }: Readonly<NavbarProps>) {
	return (
		<nav className="navbar">
			<div className="navbar-container">
				<a href="#home" className="navbar-logo">
				
					Danny Truong
				</a>
				<div className="navbar-menu">
					<ul className="nav-list">
						<li className="li-style">
							<a
								href="#home"
								className="nav-link"
								onClick={(event) => {
									event.preventDefault();
									globalThis.scrollTo({ top: 0, behavior: 'smooth' });
								}}
							>
								Home
							</a>
						</li>
						<li className="li-style">
							<a href="#about" className="nav-link">About</a>
						</li>
						<li className="li-style">
							<a href="#projects" className="nav-link">Projects</a>
						</li>
						<li className="li-style">
							<button type="button" className="nav-link nav-link-button" onClick={onContactClick}>Contact</button>
						</li>
					</ul>
				</div>
			</div>
		</nav>
	)
}

export default Navbar