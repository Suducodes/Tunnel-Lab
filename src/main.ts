import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import '@fontsource/saira-semi-condensed/500.css';
import '@fontsource/saira-semi-condensed/600.css';
import '@fontsource/saira-semi-condensed/700.css';
import './ui/app.css';
import { App } from './app';

// textures draw text into canvases, so wait for the fonts first
await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 1500))]);
const app = new App();
if (import.meta.env.DEV) Object.assign(window, { __app: app });
