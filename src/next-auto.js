// Next.js autoMount. Imported from instrumentation-client (Next.js 15.3+, webpack and Turbopack), or added to webpack's
// client entry by withSourcepeek. It does nothing unless withSourcepeek turned autoMount on for this build
// (SOURCEPEEK_AUTO_MOUNT through next.config's env), so a production build without SOURCEPEEK_ENABLE_PROD never
// loads the inspector.
if (process.env.SOURCEPEEK_AUTO_MOUNT === '1') import('./auto.js');
