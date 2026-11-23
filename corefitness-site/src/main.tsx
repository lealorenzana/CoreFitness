import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import './pages.css';
import './mockup-hero.css';
import './mockup-journey.css';
import './mockup-story.css';
import './mockup-rest.css';
import './mockup-compact.css';
import './mockup-glass-demos.css';
import './mockup-pages.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
