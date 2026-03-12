import './Contact.css'

interface ContactProps {
    onOpen: () => void;
}
   
function Contact({ onOpen }: Readonly<ContactProps>) {
    return (
        <section className="contact-section" id="contact">
            <div className="contact-panel">
                <p className="contact-eyebrow">Contact</p>
                <h2>Open a contact card from anywhere on the page.</h2>
                <p className="contact-copy">
                    Use the contact form overlay to share your name, email, and message without leaving the screen.
                </p>
                <button type="button" className="contact-cta" onClick={onOpen}>
                    Open contact form
                </button>
            </div>
        </section>
    );
}

export default Contact;