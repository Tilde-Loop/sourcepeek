// Mounts Sourcepeek without a component. The bundler plugins load this when autoMount is on (the default):
// Vite adds it to index.html, SvelteKit's client entry imports it, Next.js loads it through instrumentation-client
// or webpack's client entry, and Angular through the polyfills of the development build.
// Importing it starts the request / click / error capture right away. mount() runs once the document is parsed and
// only adds its panel after the /health request returns, so the framework has rendered or hydrated by then.
import { mount } from './client/core.js';

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  const start = () => setTimeout(mount, 0);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
}
