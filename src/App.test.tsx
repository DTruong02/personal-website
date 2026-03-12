import React from 'react';
import { render, screen } from '@testing-library/react';
import App from './App';

test('renders hero content', () => {
  render(<App />);
  const headingElement = screen.getByText(/Danny Truong/i);
  expect(headingElement).toBeInTheDocument();
});
