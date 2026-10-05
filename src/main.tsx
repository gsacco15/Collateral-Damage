import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Analytics } from '@vercel/analytics/react';
import App from './ui/App';
import { Crash } from './ui/Crash';
import './ui/styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Crash>
      <App />
    </Crash>
    <Analytics />
  </StrictMode>,
);
