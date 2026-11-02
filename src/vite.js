import { createRequire } from 'module';
import path from 'path';
import transformMod from './transform.cjs';
import handlerMod from './server/handler.cjs';
import envMod from './server/env.cjs';
import { HOOK_SOURCE } from './client/reactHook.js';

const { transform, createVueNodeTransform } = transformMod;
const { createHandler } = handlerMod;
const { enabled } = envMod;

// SvelteKit has no index.html for transformIndexHtml, so the auto-mount import goes into its client entry instead:
// the generated app.js (dev and build) and the runtime entry (older versions without a generated app.js).
const KIT_CLIENT = /[\\/](?:\.svelte-kit[\\/]generated[\\/]client(?:-optimized)?[\\/]app\.js|@sveltejs[\\/]kit[\\/]src[\\/]runtime[\\/]client[\\/]entry\.js)$/;
const AUTO = 'sourcepeek/auto';

/**
 * @param {{ autoMount?: boolean }} [options] autoMount (default true): mount the inspector without rendering
 *   <Sourcepeek /> in your app. Set it to false to render the component yourself.
 */
export default function sourcepeek(options = {}) {
  const autoMount = options.autoMount !== false;
  let root = process.cwd();
  let kit = false;
  let vueHooked = false;
  let compilerSfc = null;
  let usesReact = false;

  return {
    name: 'sourcepeek',
    enforce: 'pre',
    // Always on the dev server (SOURCEPEEK_DISABLE=1 turns it off). Production builds and `vite preview` only with
    // SOURCEPEEK_ENABLE_PROD=1 — and the backend there answers only after unlocking with SOURCEPEEK_TOKEN.
    apply(config, env) {
      const r = path.resolve(config.root || process.cwd());
      const dev = env.command === 'serve' && !env.isPreview;
      return enabled(r, { dev, mode: env.mode || (dev ? 'development' : 'production') });
    },

    config() {
      // Found by the dependency scan from the start, so adding it to index.html doesn't trigger a re-optimize + reload.
      if (autoMount) return { optimizeDeps: { include: [AUTO] } };
    },

    configResolved(config) {
      root = config.root;
      kit = config.plugins.some((p) => p && typeof p.name === 'string' && p.name.startsWith('vite-plugin-sveltekit'));
      try {
        const req = createRequire(root + '/package.json');
        const pkg = req('./package.json');
        const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
        usesReact = Boolean(deps.react || deps['react-dom'] || deps.preact);
      } catch {}
      const vuePlugin = config.plugins.find((p) => p && p.name === 'vite:vue');
      if (vuePlugin && vuePlugin.api && vuePlugin.api.options) {
        const opts = vuePlugin.api.options;
        opts.template = opts.template || {};
        opts.template.compilerOptions = opts.template.compilerOptions || {};
        const nt = opts.template.compilerOptions.nodeTransforms || [];
        opts.template.compilerOptions.nodeTransforms = [...nt, createVueNodeTransform(() => root)];
        vuePlugin.api.options = opts;
        vueHooked = true;
      } else if (vuePlugin) {
        try {
          compilerSfc = createRequire(root + '/package.json')('vue/compiler-sfc');
        } catch {}
      }
    },

    configureServer(server) {
      server.middlewares.use(createHandler({ root: () => root, dev: true }));
    },

    configurePreviewServer(server) {
      server.middlewares.use(createHandler({ root: () => root }));
    },

    // "Renders & state" counts React commits through the DevTools hook, which must exist before react-dom loads.
    // autoMount: an inline module script that imports sourcepeek/auto. `order: 'pre'` so Vite still resolves and
    // bundles that import like one written in index.html.
    transformIndexHtml: {
      order: 'pre',
      handler() {
        const tags = [];
        if (usesReact) tags.push({ tag: 'script', children: HOOK_SOURCE, injectTo: 'head-prepend' });
        if (autoMount) tags.push({ tag: 'script', attrs: { type: 'module' }, children: `import '${AUTO}';`, injectTo: 'head' });
        return tags;
      },
    },

    transform(code, id, opts) {
      if (autoMount && kit && !(opts && opts.ssr) && KIT_CLIENT.test(id.split('?')[0])) return { code: `import '${AUTO}';\n${code}`, map: null };
      if (id.includes('?')) return null;
      if (id.endsWith('.vue') && vueHooked) return null;
      return transform(code, id, root, { compilerSfc });
    },
  };
}

export { sourcepeek };
