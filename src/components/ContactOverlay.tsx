import React, { FormEvent, useEffect, useState } from 'react';
import './ContactOverlay.css';
import emailjs from '@emailjs/browser';

const EMAILJS_SERVICE_ID = process.env.REACT_APP_EMAILJS_SERVICE_ID;
const EMAILJS_TEMPLATE_ID = process.env.REACT_APP_EMAILJS_TEMPLATE_ID;
const EMAILJS_PUBLIC_KEY = process.env.REACT_APP_EMAILJS_PUBLIC_KEY;
const CLOSE_MS = 280;

interface ContactOverlayProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ContactFormData {
  name: string;
  email: string;
  company: string;
  phone: string;
  message: string;
}

const initialFormData: ContactFormData = {
  name: '',
  email: '',
  company: '',
  phone: '',
  message: '',
};

function ContactOverlay({ isOpen, onClose }: Readonly<ContactOverlayProps>) {
  const [formData, setFormData] = useState<ContactFormData>(initialFormData);
  const [submitMessage, setSubmitMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [mounted, setMounted] = useState(isOpen);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setMounted(true);
      const frame = window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => setVisible(true));
      });
      return () => window.cancelAnimationFrame(frame);
    }

    setVisible(false);
    const timeout = window.setTimeout(() => setMounted(false), CLOSE_MS);
    return () => window.clearTimeout(timeout);
  }, [isOpen]);

  useEffect(() => {
    if (!mounted) {
      return undefined;
    }

    const originalOverflow = document.body.style.overflow;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.body.style.overflow = 'hidden';
    globalThis.addEventListener('keydown', handleEscape);

    return () => {
      document.body.style.overflow = originalOverflow;
      globalThis.removeEventListener('keydown', handleEscape);
    };
  }, [mounted, onClose]);

  if (!mounted) {
    return null;
  }

  const handleChange = (
    event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = event.target;

    setFormData((currentFormData) => ({
      ...currentFormData,
      [name]: value,
    }));

    if (submitMessage) {
      setSubmitMessage('');
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!EMAILJS_SERVICE_ID || !EMAILJS_TEMPLATE_ID || !EMAILJS_PUBLIC_KEY) {
      setSubmitMessage('Email service is not configured yet. Please try again later.');
      return;
    }

    try {
      setIsSubmitting(true);

      await emailjs.send(
        EMAILJS_SERVICE_ID,
        EMAILJS_TEMPLATE_ID,
        {
          name: formData.name,
          email: formData.email,
          company: formData.company || 'Not provided',
          phone: formData.phone || 'Not provided',
          message: formData.message,
        },
        {
          publicKey: EMAILJS_PUBLIC_KEY,
        }
      );

      setSubmitMessage('Thanks! Your message was sent successfully.');
      setFormData(initialFormData);
    } catch (error) {
      console.error('EmailJS send failed:', error);
      setSubmitMessage('There was an issue sending your message. Please try again in a moment.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className={`contact-overlay${visible ? ' is-visible' : ''}`}
      aria-hidden={!visible}
    >
      <button
        type="button"
        className="contact-backdrop"
        onClick={onClose}
        aria-label="Close contact form"
      />
      <dialog
        className="contact-modal"
        open
        aria-labelledby="contact-overlay-title"
      >
        <button
          type="button"
          className="contact-close"
          onClick={onClose}
          aria-label="Close contact form"
        >
          ×
        </button>
        <p className="contact-modal-eyebrow">contact</p>
        <h2 id="contact-overlay-title">Send a message</h2>
        <p className="contact-modal-copy">
          Fill this out and it goes straight to my inbox.
        </p>
        <form className="contact-form" onSubmit={handleSubmit}>
          <label className="contact-field">
            <span>Name</span>
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleChange}
              required
            />
          </label>
          <label className="contact-field">
            <span>Email</span>
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              required
            />
          </label>
          <label className="contact-field">
            <span>Company</span>
            <input
              type="text"
              name="company"
              value={formData.company}
              onChange={handleChange}
            />
          </label>
          <label className="contact-field">
            <span>Phone</span>
            <input
              type="tel"
              name="phone"
              value={formData.phone}
              onChange={handleChange}
            />
          </label>
          <label className="contact-field contact-field-full">
            <span>Message</span>
            <textarea
              name="message"
              value={formData.message}
              onChange={handleChange}
              rows={5}
              required
            />
          </label>
          <div className="contact-actions">
            <button type="submit" className="contact-submit" disabled={isSubmitting}>
              {isSubmitting ? 'Sending...' : 'Send message'}
            </button>
            <button type="button" className="contact-secondary" onClick={onClose}>
              Cancel
            </button>
          </div>
          {submitMessage ? (
            <p className="contact-submit-message">{submitMessage}</p>
          ) : null}
        </form>
      </dialog>
    </div>
  );
}

export default ContactOverlay;
