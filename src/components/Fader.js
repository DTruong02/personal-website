import React from 'react'
import PropTypes from 'prop-types'
import '../App.css'

const Fader = props => {

	const [fadeProp, setFadeProp] = useState({
		fade: 'fade-in',
	});
	
	return (
		<div>

		</div>
	)
}

Fader.defaultProps = {
	text: 'Hello World'
}

Fader.propTypes = {
	text: PropTypes.string
}

export default Fader