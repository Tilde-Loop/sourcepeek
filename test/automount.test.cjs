'use strict';
// autoMount: the plugins mount Sourcepeek without a component in the app. Vite injects the import into index.html
// (SvelteKit: its client entry), Next.js uses instrumentation-client or webpack's client entry, and `npx sourcepeek
// setup` wires Next.js and Angular. Run with `npm test` (node --test).

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const BIN = path.join(__dirname, '..', 'bin', 'sourcepeek.js');
const AUTO_ENTRY = path.join(__dirname, '..', 'src', 'next-auto.js');

function tmp(files = {}) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'sp-auto-')));
  for (const [f, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, f)), { recursive: true });
    fs.writeFileSync(path.join(root, f), typeof text === 'string' ? text : JSON.stringify(text, null, 2));
  }
  return root;
}

function cli(root, ...args) {
  return execFileSync(process.execPath, [BIN, ...args], { cwd: root, encoding: 'utf8' });
}

async function vitePlugin(options) {
  const { default: sourcepeek } = await import('../src/vite.js');
  const plugin = sourcepeek(options);
  plugin.configResolved({ root: tmp({ 'package.json': { dependencies: {} } }), plugins: [{ name: 'vite-plugin-sveltekit-setup' }] });
  return plugin;
}

test('vite: index.html gets the sourcepeek/auto import, before Vite processes inline modules', async () => {
  const plugin = await vitePlugin();
  assert.equal(plugin.transformIndexHtml.order, 'pre');
  const tags = plugin.transformIndexHtml.handler();
  assert.deepEqual(tags, [{ tag: 'script', attrs: { type: 'module' }, children: "import 'sourcepeek/auto';", injectTo: 'head' }]);
  assert.deepEqual(plugin.config(), { optimizeDeps: { include: ['sourcepeek/auto'] } });
});

test('vite: autoMount: false injects nothing', async () => {
  const plugin = await vitePlugin({ autoMount: false });
  assert.deepEqual(plugin.transformIndexHtml.handler(), []);
  assert.equal(plugin.config(), undefined);
});

test('vite: the SvelteKit client entry imports sourcepeek/auto, the SSR build does not', async () => {
  const plugin = await vitePlugin();
  const id = '/app/.svelte-kit/generated/client/app.js';
  assert.match(plugin.transform('export const x = 1;', id).code, /^import 'sourcepeek\/auto';\n/);
  assert.match(plugin.transform('export const x = 1;', '/app/.svelte-kit/generated/client-optimized/app.js?v=1').code, /sourcepeek\/auto/);
  const ssr = plugin.transform('export const x = 1;', id, { ssr: true });
  assert.ok(!ssr || !/sourcepeek\/auto/.test(ssr.code));
});

async function nextConfig(root, options, files) {
  const withSourcepeek = require('../src/next.cjs');
  const cwd = process.cwd();
  const env = { ...process.env };
  process.chdir(root);
  process.env.SOURCEPEEK_ENABLE_PROD = '1';
  process.env.SOURCEPEEK_TOKEN = 'x'.repeat(24);
  delete process.env.SOURCEPEEK_DISABLE;
  delete process.env.TURBOPACK;
  try {
    return await withSourcepeek({}, options)('phase-production-build', {});
  } finally {
    process.chdir(cwd);
    process.env = env;
  }
}

async function clientEntries(config) {
  const wc = { module: { rules: [] }, entry: async () => ({ 'main-app': ['next/dist/client/app-next.js'], main: ['next/dist/client/next.js'] }) };
  const out = config.webpack(wc, { isServer: false, dev: false });
  return out.entry();
}

test('next: autoMount sets the build flag and adds the webpack client entry', async () => {
  const root = tmp({ 'package.json': { dependencies: { next: '14.2.0' } }, 'pages/index.js': '' });
  const config = await nextConfig(root);
  assert.equal(config.env.SOURCEPEEK_AUTO_MOUNT, '1');
  const entries = await clientEntries(config);
  assert.deepEqual(entries['main-app'], ['next/dist/client/app-next.js', AUTO_ENTRY]);
  assert.deepEqual(entries.main, ['next/dist/client/next.js', AUTO_ENTRY]);
});

test('next: an instrumentation-client that imports sourcepeek/next/auto replaces the webpack entry', async () => {
  const root = tmp({ 'package.json': { dependencies: { next: '16.0.0' } }, 'src/instrumentation-client.ts': "import 'sourcepeek/next/auto';\n" });
  const config = await nextConfig(root);
  assert.equal(config.env.SOURCEPEEK_AUTO_MOUNT, '1');
  const entries = await clientEntries(config);
  assert.ok(!entries['main-app'].includes(AUTO_ENTRY));
});

test('next: autoMount: false adds neither the flag nor the entry', async () => {
  const root = tmp({ 'package.json': { dependencies: { next: '14.2.0' } }, 'pages/index.js': '' });
  const config = await nextConfig(root, { autoMount: false });
  assert.ok(!config.env || !config.env.SOURCEPEEK_AUTO_MOUNT);
  assert.ok(!(await clientEntries(config))['main-app'].includes(AUTO_ENTRY));
});

test('setup: Next.js 15.3+ gets instrumentation-client, and remove deletes it again', () => {
  const root = tmp({
    'package.json': { dependencies: { next: '16.0.0' } },
    'node_modules/next/package.json': { name: 'next', version: '16.0.0' },
    'next.config.mjs': 'export default {};\n',
    'tsconfig.json': '{}',
    'src/app/page.tsx': 'export default function Page() { return null; }\n',
  });
  cli(root, 'setup');
  const file = path.join(root, 'src/instrumentation-client.ts');
  assert.match(fs.readFileSync(file, 'utf8'), /^import 'sourcepeek\/next\/auto';$/m);
  cli(root, 'setup');
  assert.equal(fs.readFileSync(file, 'utf8').match(/sourcepeek\/next\/auto/g).length, 1);
  cli(root, 'remove');
  assert.ok(!fs.existsSync(file));
});

test('setup: an existing instrumentation-client keeps its code', () => {
  const root = tmp({
    'package.json': { dependencies: { next: '15.3.0' } },
    'node_modules/next/package.json': { name: 'next', version: '15.3.0' },
    'next.config.js': 'module.exports = {};\n',
    'app/page.js': '',
    'instrumentation-client.js': "console.log('mine');\n",
  });
  cli(root, 'setup');
  const file = path.join(root, 'instrumentation-client.js');
  assert.equal(fs.readFileSync(file, 'utf8'), "import 'sourcepeek/next/auto';\nconsole.log('mine');\n");
  cli(root, 'remove');
  assert.equal(fs.readFileSync(file, 'utf8'), "console.log('mine');\n");
});

test('setup: Angular gets sourcepeek/angular/auto in the development polyfills only, and remove restores them', () => {
  const ws = {
    version: 1,
    projects: {
      app: {
        architect: {
          build: {
            builder: '@angular/build:application',
            options: { polyfills: ['zone.js'] },
            configurations: { production: {}, development: { optimization: false } },
          },
          serve: {
            builder: '@angular/build:dev-server',
            configurations: { production: { buildTarget: 'app:build:production' }, development: { buildTarget: 'app:build:development' } },
            defaultConfiguration: 'development',
          },
        },
      },
    },
  };
  const root = tmp({ 'package.json': { dependencies: { '@angular/core': '^20.0.0' } }, 'angular.json': ws });
  cli(root, 'setup');
  let build = JSON.parse(fs.readFileSync(path.join(root, 'angular.json'), 'utf8')).projects.app.architect.build;
  assert.deepEqual(build.configurations.development.polyfills, ['zone.js', 'sourcepeek/angular/auto']);
  assert.deepEqual(build.options.polyfills, ['zone.js']);
  assert.equal(build.configurations.production.polyfills, undefined);
  cli(root, 'remove');
  build = JSON.parse(fs.readFileSync(path.join(root, 'angular.json'), 'utf8')).projects.app.architect.build;
  assert.deepEqual(build.configurations.development, { optimization: false });
});
