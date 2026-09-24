import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// The game draws its own pixel-art UI instead of using Capra components, so it
// skips Capra's stylesheets: their unlayered base rules would restyle the page.
import '@fontsource/press-start-2p/400.css';
import '@fontsource/pixelify-sans/400.css';
import '@fontsource/pixelify-sans/600.css';
import './globals.css';
import App from './App';
import { installFavicon } from './favicon';

installFavicon();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
