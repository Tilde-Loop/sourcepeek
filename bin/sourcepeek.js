#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { parse } = require('@babel/parser');

const cwd = process.cwd();
const c = {
  b: (s) => `\x1b[1m${s}\x1b[0m`,
  g: (s) => `\x1b[32m${s}\x1b[0m`,
  y: (s) => `\x1b[33m${s}\x1b[0m`,
  r: (s) => `\x1b[31m${s}\x1b[0m`,
  d: (s) => `\x1b[2m${s}\x1b[0m`,
  m: (s) => `\x1b[35m${s}\x1b[0m`,
};
const ok = (s) => console.log(`${c.g('✔')} ${s}`);
const warn = (s) => console.log(`${c.y('!')} ${s}`);
const fail = (s) => console.log(`${c.r('✖')} ${s}`);

function readPkg() {
  const p = path.join(cwd, 'package.json');
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function findFile(names) {
  for (const n of names) {
    const p = path.join(cwd, n);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

const NEXT_CONFIGS = ['next.config.ts', 'next.config.mjs', 'next.config.js', 'next.config.cjs', 'next.config.mts'];
const VITE_CONFIGS = ['vite.config.ts', 'vite.config.js', 'vite.config.mts', 'vite.config.mjs', 'vite.config.cts', 'vite.config.cjs'];

function detect() {
  const pkg = readPkg();
  if (!pkg) return { kind: 'none' };
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  let ui = 'unknown';
  if (deps['@angular/core']) ui = 'angular';
  else if (deps['@sveltejs/kit']) ui = 'sveltekit';
  else if (deps.svelte) ui = 'svelte';
  else if (deps.nuxt) ui = 'nuxt';
  else if (deps.vue) ui = 'vue';
  else if (deps.react || deps.next || deps.preact) ui = 'react';

  if (deps['@angular/core'] && findFile(['angular.json'])) return { kind: 'angular', ui: 'angular', file: findFile(['angular.json']) };
  if (deps.next) return { kind: 'next', ui: 'react', file: findFile(NEXT_CONFIGS), appDir: fs.existsSync(path.join(cwd, 'app')) || fs.existsSync(path.join(cwd, 'src/app')) };
  if (deps.nuxt) return { kind: 'nuxt', ui };
  if (deps['react-scripts']) return { kind: 'cra', ui };
  if (deps.vite || deps['@sveltejs/kit'] || findFile(VITE_CONFIGS)) return { kind: 'vite', ui, file: findFile(VITE_CONFIGS) };
  return { kind: 'unknown', ui };
}

function parseFile(code, file) {
  const ts = /\.[cm]?ts$/.test(file);
  return parse(code, {
    sourceType: 'module',
    allowReturnOutsideFunction: true,
    allowImportExportEverywhere: true,
    plugins: ts ? ['typescript'] : [],
  });
}

function walk(node, fn, parent) {
  if (!node || typeof node.type !== 'string') return;
  if (fn(node, parent) === false) return;
  for (const k of Object.keys(node)) {
    if (k === 'loc' || k === 'extra' || k.endsWith('Comments')) continue;
    const v = node[k];
    if (Array.isArray(v)) v.forEach((x) => walk(x, fn, node));
    else if (v && typeof v.type === 'string') walk(v, fn, node);
  }
}

function splice(code, edits) {
  return edits
    .sort((a, b) => b.start - a.start)
    .reduce((out, e) => out.slice(0, e.start) + e.text + out.slice(e.end), code);
}

function importInsertPos(ast) {
  let pos = 0;
  for (const n of ast.program.body) {
    if (n.type === 'ImportDeclaration') pos = n.end;
    else if (pos === 0 && n.type === 'ExpressionStatement' && n.directive) pos = n.end;
  }
  return pos;
}

function usesEsm(ast, file) {
  if (/\.(mjs|mts|ts)$/.test(file)) return true;
  if (/\.(cjs|cts)$/.test(file)) return false;
  return ast.program.body.some((n) => /^(Import|Export)/.test(n.type));
}

function backup(file) {
  const b = file + '.sourcepeek-backup';
  if (!fs.existsSync(b)) fs.copyFileSync(file, b);
}

const rel = (f) => path.relative(cwd, f) || f;

function setupNext(info) {
  let file = info.file;
  if (!file) {
    file = path.join(cwd, 'next.config.mjs');
    fs.writeFileSync(file, `import { withSourcepeek } from 'sourcepeek/next';\n\n/** @type {import('next').NextConfig} */\nconst nextConfig = {};\n\nexport default withSourcepeek(nextConfig);\n`);
    ok(`Created ${rel(file)}`);
    return true;
  }
  const code = fs.readFileSync(file, 'utf8');
  if (code.includes('withSourcepeek')) {
    ok(`${rel(file)} already uses withSourcepeek`);
    return true;
  }
  const ast = parseFile(code, file);
  let target = null;
  for (const n of ast.program.body) {
    if (n.type === 'ExportDefaultDeclaration' && n.declaration && !/Declaration$/.test(n.declaration.type)) target = n.declaration;
    if (
      n.type === 'ExpressionStatement' &&
      n.expression.type === 'AssignmentExpression' &&
      n.expression.left.type === 'MemberExpression' &&
      n.expression.left.object.name === 'module' &&
      (n.expression.left.property.name === 'exports')
    )
      target = n.expression.right;
  }
  if (!target) {
    fail(`Couldn't find the exported config in ${rel(file)}.`);
    console.log(c.d(`  Wrap it manually:  export default withSourcepeek(nextConfig)  (import { withSourcepeek } from 'sourcepeek/next')`));
    return false;
  }
  const esm = usesEsm(ast, file);
  const importLine = esm ? `import { withSourcepeek } from 'sourcepeek/next';` : `const { withSourcepeek } = require('sourcepeek/next');`;
  const at = esm ? importInsertPos(ast) : 0;
  const out = splice(code, [
    { start: target.start, end: target.end, text: `withSourcepeek(${code.slice(target.start, target.end)})` },
    { start: at, end: at, text: at === 0 ? importLine + '\n' : '\n' + importLine },
  ]);
  backup(file);
  fs.writeFileSync(file, out);
  ok(`Patched ${rel(file)} → export wrapped in withSourcepeek()`);
  return true;
}

// ---------- autoMount ----------
// The plugin mounts Sourcepeek itself, so nothing goes into the app's layout. Next.js 15.3+ needs one import in
// instrumentation-client (loaded by Next.js in the browser, webpack and Turbopack alike); older versions get it
// through webpack's client entry. Angular gets it through the polyfills of the development build.

const NEXT_AUTO = 'sourcepeek/next/auto';
const NEXT_AUTO_LINE = `import '${NEXT_AUTO}';`;
const INSTRUMENTATION = ['js', 'ts', 'mjs', 'jsx', 'tsx'].flatMap((ext) => [`instrumentation-client.${ext}`, `src/instrumentation-client.${ext}`]);

function nextVersion() {
  try {
    const v = createRequire(path.join(cwd, 'package.json'))('next/package.json').version;
    const [maj, min] = v.split('.').map(Number);
    return { maj, min };
  } catch {
    return null;
  }
}

function setupNextAutoMount() {
  const v = nextVersion();
  if (v && !(v.maj > 15 || (v.maj === 15 && v.min >= 3))) {
    ok('Sourcepeek mounts itself through the webpack client entry (Next.js before 15.3 has no instrumentation-client).');
    if (/--turbo/.test(JSON.stringify(readPkg().scripts || {})))
      warn('Turbopack before Next.js 15.3 has no hook for that: render <Sourcepeek /> (sourcepeek/react) in your layout, or upgrade Next.js.');
    return;
  }
  const existing = findFile(INSTRUMENTATION);
  if (existing) {
    const code = fs.readFileSync(existing, 'utf8');
    if (code.includes(NEXT_AUTO)) return ok(`${rel(existing)} already imports ${NEXT_AUTO}`);
    backup(existing);
    fs.writeFileSync(existing, `${NEXT_AUTO_LINE}\n${code}`);
    return ok(`Patched ${rel(existing)} → imports ${NEXT_AUTO}`);
  }
  const inSrc = !fs.existsSync(path.join(cwd, 'app')) && !fs.existsSync(path.join(cwd, 'pages')) && (fs.existsSync(path.join(cwd, 'src/app')) || fs.existsSync(path.join(cwd, 'src/pages')));
  const file = path.join(cwd, inSrc ? 'src' : '', `instrumentation-client.${fs.existsSync(path.join(cwd, 'tsconfig.json')) ? 'ts' : 'js'}`);
  fs.writeFileSync(
    file,
    `// Created by \`npx sourcepeek setup\`: mounts Sourcepeek in the browser, so your layout needs no <Sourcepeek />.\n` +
      `// It only does something where withSourcepeek() is active (next dev, or production with SOURCEPEEK_ENABLE_PROD).\n` +
      `${NEXT_AUTO_LINE}\n`
  );
  ok(`Created ${rel(file)} (Next.js loads it in the browser; it mounts Sourcepeek)`);
}

function removeNextAutoMount() {
  for (const f of INSTRUMENTATION) {
    const p = path.join(cwd, f);
    if (!fs.existsSync(p)) continue;
    const code = fs.readFileSync(p, 'utf8');
    if (!code.includes(NEXT_AUTO)) continue;
    const rest = code.replace(/^.*['"]sourcepeek\/next\/auto['"].*\n?/m, '');
    if (/^\s*$/.test(rest.replace(/^\s*\/\/.*$/gm, ''))) {
      fs.unlinkSync(p);
      ok(`Removed ${rel(p)}`);
    } else {
      fs.writeFileSync(p, rest);
      ok(`Removed the sourcepeek import from ${rel(p)}`);
    }
  }
}

// Angular: `ng serve` builds the "development" configuration of the build target (whatever the serve target's
// buildTarget / browserTarget names). Its polyfills get sourcepeek/angular/auto, so production builds stay untouched.
const NG_AUTO = 'sourcepeek/angular/auto';

function devBuildConfigs(proj, serve) {
  const names = new Set();
  for (const opts of [serve.options || {}, ...Object.values(serve.configurations || {})]) {
    const t = opts.buildTarget || opts.browserTarget;
    const cfg = t && t.split(':')[2];
    if (cfg && cfg !== 'production') names.add(cfg);
  }
  if (!names.size) names.add('development');
  const build = (proj.architect || proj.targets || {}).build;
  return build ? [...names].map((n) => ({ name: n, build })) : [];
}

function setupAngularAutoMount(ws) {
  let changed = false;
  for (const [name, proj] of Object.entries(ws.projects || {})) {
    const serve = (proj.architect || proj.targets || {}).serve;
    if (!serve || !/dev-server/.test(String(serve.builder || ''))) continue;
    for (const { name: cfg, build } of devBuildConfigs(proj, serve)) {
      build.configurations = build.configurations || {};
      const c = (build.configurations[cfg] = build.configurations[cfg] || {});
      const base = c.polyfills !== undefined ? c.polyfills : (build.options || {}).polyfills;
      const list = base === undefined ? [] : Array.isArray(base) ? [...base] : [base];
      if (list.includes(NG_AUTO)) continue;
      // Configurations replace options, so the development list repeats the base polyfills (zone.js first).
      c.polyfills = [...list, NG_AUTO];
      changed = true;
      ok(`${name}: the ${cfg} build loads ${NG_AUTO} (polyfills)`);
    }
  }
  return changed;
}

function removeAngularAutoMount(ws) {
  let changed = false;
  for (const proj of Object.values(ws.projects || {})) {
    const build = (proj.architect || proj.targets || {}).build;
    if (!build) continue;
    const base = (build.options || {}).polyfills;
    for (const c of [build.options || {}, ...Object.values(build.configurations || {})]) {
      if (!Array.isArray(c.polyfills) || !c.polyfills.includes(NG_AUTO)) continue;
      c.polyfills = c.polyfills.filter((p) => p !== NG_AUTO);
      // Setup copied the base list into the configuration; drop that copy again when it matches.
      const same = JSON.stringify(c.polyfills) === JSON.stringify(base === undefined ? [] : [].concat(base));
      if (c !== build.options && same) delete c.polyfills;
      changed = true;
    }
  }
  return changed;
}

function setupVite(info) {
  let file = info.file;
  if (!file) {
    file = path.join(cwd, 'vite.config.js');
    fs.writeFileSync(file, `import { defineConfig } from 'vite';\nimport sourcepeek from 'sourcepeek/vite';\n\nexport default defineConfig({\n  plugins: [sourcepeek()],\n});\n`);
    ok(`Created ${rel(file)}`);
    return true;
  }
  const code = fs.readFileSync(file, 'utf8');
  if (/['"]sourcepeek\/vite['"]/.test(code)) {
    ok(`${rel(file)} already uses the sourcepeek plugin`);
    return true;
  }
  if (/\.c[jt]s$/.test(file)) {
    fail(`${rel(file)} is CommonJS — add the plugin manually: plugins: [require('sourcepeek/vite').default(), ...]`);
    return false;
  }
  const ast = parseFile(code, file);
  let pluginsArr = null;
  let configObj = null;
  walk(ast.program, (n, parent) => {
    if (!pluginsArr && (n.type === 'ObjectProperty' || n.type === 'Property') && !n.computed && (n.key.name === 'plugins' || n.key.value === 'plugins') && n.value.type === 'ArrayExpression') {
      pluginsArr = n.value;
    }
    if (!configObj && n.type === 'ObjectExpression' && parent && (parent.type === 'CallExpression' || parent.type === 'ExportDefaultDeclaration' || parent.type === 'ArrowFunctionExpression' || parent.type === 'ReturnStatement')) {
      configObj = n;
    }
  });
  const edits = [];
  if (pluginsArr) {
    const first = pluginsArr.elements.find(Boolean);
    if (first) {
      const ws = code.slice(pluginsArr.start + 1, first.start);
      edits.push({ start: first.start, end: first.start, text: 'sourcepeek(),' + (ws || ' ') });
    } else {
      edits.push({ start: pluginsArr.start + 1, end: pluginsArr.start + 1, text: 'sourcepeek()' });
    }
  } else if (configObj) {
    const at = configObj.start + 1;
    edits.push({ start: at, end: at, text: '\n  plugins: [sourcepeek()],' });
  } else {
    fail(`Couldn't find the config object in ${rel(file)}. Add  plugins: [sourcepeek()]  manually (import sourcepeek from 'sourcepeek/vite').`);
    return false;
  }
  const at = importInsertPos(ast);
  const line = `import sourcepeek from 'sourcepeek/vite';`;
  edits.push({ start: at, end: at, text: at === 0 ? line + '\n' : '\n' + line });
  backup(file);
  fs.writeFileSync(file, splice(code, edits));
  ok(`Patched ${rel(file)} → added sourcepeek() to plugins`);
  return true;
}

// ---------- Angular ----------
// `ng serve` has no plugin hook, but it loads a proxy configuration file. Setup points every serve target at
// sourcepeek.proxy.mjs, which starts the Sourcepeek backend and proxies /__sourcepeek to it — keeping any proxy
// configuration the project already had (it is loaded and merged by sourcepeekProxy()).

const NG_PROXY = 'sourcepeek.proxy.mjs';

function serveTargets(ws) {
  const out = [];
  for (const [name, proj] of Object.entries(ws.projects || {})) {
    const targets = proj.architect || proj.targets || {};
    const serve = targets.serve;
    if (serve && /dev-server/.test(String(serve.builder || ''))) out.push({ name, serve });
  }
  return out;
}

function proxyFileCode(existing) {
  const arg = existing ? `'./${existing.replace(/^\.\//, '').replace(/'/g, "\\'")}'` : '{}';
  return `// Created by \`npx sourcepeek setup\`. Starts the Sourcepeek dev backend and forwards /__sourcepeek to it.
// ${existing ? `Your own proxy settings stay in ${existing}.` : 'Put your own proxy rules in the object below.'} Undo with \`npx sourcepeek remove\`.
import { sourcepeekProxy } from 'sourcepeek/angular/proxy';

export default await sourcepeekProxy(${arg});
`;
}

function setupAngular(info) {
  const file = info.file;
  let ws;
  try {
    ws = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    fail(`Could not read ${rel(file)}: ${err.message}`);
    return false;
  }
  const targets = serveTargets(ws);
  if (!targets.length) {
    fail(`No "serve" target with an Angular dev-server builder in ${rel(file)}.`);
    return false;
  }
  // Every distinct existing proxyConfig gets its own wrapper; projects without one share sourcepeek.proxy.mjs.
  const wrappers = new Map(); // existing proxyConfig (or '') → wrapper file name
  const wrapperFor = (existing) => {
    if (existing && /sourcepeek\.proxy[\w.-]*\.mjs$/.test(existing)) return existing;
    const key = existing || '';
    if (!wrappers.has(key)) {
      const n = wrappers.size;
      wrappers.set(key, n === 0 ? NG_PROXY : NG_PROXY.replace('.mjs', `.${n + 1}.mjs`));
    }
    return wrappers.get(key);
  };
  let changed = false;
  for (const { name, serve } of targets) {
    serve.options = serve.options || {};
    const sets = [serve.options, ...Object.values(serve.configurations || {})];
    for (const opts of sets) {
      if (opts !== serve.options && !opts.proxyConfig) continue;
      const before = opts.proxyConfig;
      const next = wrapperFor(before);
      if (before !== next) {
        opts.proxyConfig = next;
        changed = true;
      }
    }
    ok(`${name}: ng serve loads ${serve.options.proxyConfig}`);
  }
  for (const [existing, wrapper] of wrappers) {
    const abs = path.join(cwd, wrapper);
    if (fs.existsSync(abs) && !/sourcepeek\/angular\/proxy/.test(fs.readFileSync(abs, 'utf8'))) {
      fail(`${wrapper} already exists and was not created by sourcepeek — nothing changed.`);
      return false;
    }
    fs.writeFileSync(abs, proxyFileCode(existing));
    ok(`Created ${wrapper}${existing ? ` (it keeps your proxy rules from ${existing})` : ''}`);
  }
  const auto = setupAngularAutoMount(ws);
  if (changed || auto) {
    backup(file);
    const indent = (fs.readFileSync(file, 'utf8').match(/\n([ \t]+)"/) || [, '  '])[1];
    fs.writeFileSync(file, JSON.stringify(ws, null, indent) + '\n');
    ok(`Patched ${rel(file)} → ${[changed && 'proxyConfig', auto && 'polyfills'].filter(Boolean).join(', ')}`);
  } else ok(`${rel(file)} already uses the sourcepeek proxy`);
  return true;
}

function removeAngular() {
  const file = path.join(cwd, 'angular.json');
  if (!fs.existsSync(file)) return;
  let ws;
  try {
    ws = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return;
  }
  let changed = removeAngularAutoMount(ws);
  const wrappers = new Set();
  for (const { serve } of serveTargets(ws)) {
    for (const opts of [serve.options || {}, ...Object.values(serve.configurations || {})]) {
      const v = opts.proxyConfig;
      if (!v || !/sourcepeek\.proxy[\w.-]*\.mjs$/.test(v)) continue;
      wrappers.add(v);
      const code = fs.existsSync(path.join(cwd, v)) ? fs.readFileSync(path.join(cwd, v), 'utf8') : '';
      const m = code.match(/sourcepeekProxy\(\s*'([^']+)'\s*\)/);
      if (m) opts.proxyConfig = m[1].replace(/^\.\//, '');
      else delete opts.proxyConfig;
      changed = true;
    }
  }
  if (changed) {
    const indent = (fs.readFileSync(file, 'utf8').match(/\n([ \t]+)"/) || [, '  '])[1];
    fs.writeFileSync(file, JSON.stringify(ws, null, indent) + '\n');
    ok(`Removed sourcepeek from ${rel(file)}`);
  }
  for (const w of wrappers) {
    const abs = path.join(cwd, w);
    if (fs.existsSync(abs) && /sourcepeek\/angular\/proxy/.test(fs.readFileSync(abs, 'utf8'))) {
      const code = fs.readFileSync(abs, 'utf8');
      if (/sourcepeekProxy\(\s*\{\s*\}\s*\)/.test(code) || /sourcepeekProxy\(\s*'[^']+'\s*\)/.test(code)) {
        fs.unlinkSync(abs);
        ok(`Removed ${w}`);
      } else warn(`${w} contains your own proxy rules — kept it. Move them to a proxy.conf.json and delete ${w}.`);
    }
  }
}

function cleanupLegacyBabel() {
  for (const n of ['babel.config.js', 'babel.config.cjs', '.babelrc']) {
    const p = path.join(cwd, n);
    if (!fs.existsSync(p)) continue;
    const txt = fs.readFileSync(p, 'utf8');
    if (/sourcepeek|codeview/i.test(txt)) {
      fs.renameSync(p, p + '.sourcepeek-old');
      ok(`Removed old ${n} created by a previous sourcepeek/codeview version (saved as ${n}.sourcepeek-old)`);
      console.log(c.d(`  It switched Next.js off SWC and broke next/font — it's no longer needed.`));
    }
  }
}

function removeFrom(file) {
  if (!file || !fs.existsSync(file)) return;
  const code = fs.readFileSync(file, 'utf8');
  if (!code.includes('sourcepeek')) return;
  const ast = parseFile(code, file);
  const edits = [];
  walk(ast.program, (n, parent) => {
    if (n.type === 'ImportDeclaration' && /^sourcepeek(\/|$)/.test(n.source.value)) {
      const end = code[n.end] === '\n' ? n.end + 1 : n.end;
      edits.push({ start: n.start, end, text: '' });
      return false;
    }
    if (n.type === 'VariableDeclaration' && code.slice(n.start, n.end).includes(`require('sourcepeek`)) {
      const end = code[n.end] === '\n' ? n.end + 1 : n.end;
      edits.push({ start: n.start, end, text: '' });
      return false;
    }
    if (n.type === 'CallExpression' && n.callee.type === 'Identifier') {
      if (n.callee.name === 'withSourcepeek' && n.arguments[0]) {
        const a = n.arguments[0];
        edits.push({ start: n.start, end: n.end, text: code.slice(a.start, a.end) });
        return false;
      }
      if (n.callee.name === 'sourcepeek' && parent && parent.type === 'ArrayExpression') {
        let end = n.end;
        const m = code.slice(end).match(/^\s*,\s*/);
        if (m) end += m[0].length;
        edits.push({ start: n.start, end, text: '' });
        return false;
      }
    }
  });
  if (!edits.length) return;
  fs.writeFileSync(file, splice(code, edits));
  ok(`Removed sourcepeek from ${rel(file)}`);
}

// A <Sourcepeek /> or provideSourcepeek() from before autoMount still works (both share one panel), but is no longer needed.
const LEFTOVER_FILES = [
  'app/layout.tsx', 'app/layout.jsx', 'app/layout.js', 'src/app/layout.tsx', 'src/app/layout.jsx', 'src/app/layout.js',
  'pages/_app.tsx', 'pages/_app.jsx', 'pages/_app.js', 'src/pages/_app.tsx', 'src/pages/_app.jsx', 'src/pages/_app.js',
  'src/App.tsx', 'src/App.jsx', 'src/App.vue', 'src/App.svelte', 'src/routes/+layout.svelte',
  'src/main.tsx', 'src/main.jsx', 'src/main.ts', 'src/main.js', 'src/app/app.config.ts', 'src/app/app.module.ts',
];

function leftoverMounts() {
  return LEFTOVER_FILES.filter((f) => {
    try {
      return /from\s+['"]sourcepeek\/(react|vue|svelte|angular)['"]/.test(fs.readFileSync(path.join(cwd, f), 'utf8'));
    } catch {
      return false;
    }
  });
}

function printUsage(info) {
  console.log(`\n${c.b('Sourcepeek mounts itself')} ${c.d('— nothing to add to your layout or app code.')}`);
  const left = leftoverMounts();
  if (left.length) {
    const what = info.kind === 'angular' ? 'provideSourcepeek()' : '<Sourcepeek />';
    console.log(c.d(`  ${left.join(', ')} still ${left.length > 1 ? 'use' : 'uses'} ${what} from an earlier setup. It keeps working, but you can delete it.`));
  }
  console.log(c.d(`  To render it yourself instead (e.g. only for some users), turn autoMount off: ${info.kind === 'next' ? 'withSourcepeek(nextConfig, { autoMount: false })' : info.kind === 'angular' ? `remove '${NG_AUTO}' from the polyfills in angular.json and add provideSourcepeek()` : 'sourcepeek({ autoMount: false })'}.`));
  if (info.kind !== 'angular') console.log(`\n${c.d('It runs on your dev server. Production builds stay off unless you set SOURCEPEEK_ENABLE_PROD=1 and a SOURCEPEEK_TOKEN (npx sourcepeek token).')}`);
  else console.log(`\n${c.d('It runs on ng serve only — production builds are not changed.')}`);
  console.log(`${c.d('Optional AI features: put OPENAI_API_KEY, ANTHROPIC_API_KEY or GEMINI_API_KEY in .env.local (or .env).')}`);
  console.log(`\nThen restart your dev server${info.kind === 'angular' ? ' (ng serve)' : ''} and click ${c.b('“Sourcepeek: OFF”')} in the bottom-right corner.`);
  console.log(`${c.d('Using Claude Code, Cursor or VS Code? Run')} ${c.b('npx sourcepeek mcp setup')} ${c.d('so your agent knows which element you clicked.')}\n`);
}

function prodRouteTarget() {
  const ts = fs.existsSync(path.join(cwd, 'tsconfig.json'));
  const ext = ts ? 'ts' : 'js';
  for (const base of ['app', 'src/app']) {
    if (fs.existsSync(path.join(cwd, base))) {
      return {
        file: path.join(cwd, base, 'api/sourcepeek/[...path]', `route.${ext}`),
        code: `export { GET, POST } from 'sourcepeek/next/route';\n`,
      };
    }
  }
  for (const base of ['pages', 'src/pages']) {
    if (fs.existsSync(path.join(cwd, base))) {
      return {
        file: path.join(cwd, base, 'api/sourcepeek', `[...path].${ext}`),
        code: `export { default } from 'sourcepeek/next/api';\n`,
      };
    }
  }
  return null;
}

const PROD_ROUTE_FILES = [
  'app/api/sourcepeek/[...path]/route.js',
  'app/api/sourcepeek/[...path]/route.ts',
  'src/app/api/sourcepeek/[...path]/route.js',
  'src/app/api/sourcepeek/[...path]/route.ts',
  'pages/api/sourcepeek/[...path].js',
  'pages/api/sourcepeek/[...path].ts',
  'src/pages/api/sourcepeek/[...path].js',
  'src/pages/api/sourcepeek/[...path].ts',
];

function setupProd(info) {
  if (info.kind === 'angular') {
    fail('Angular is supported on the dev server (ng serve) only.');
    return false;
  }
  if (info.kind !== 'next') {
    if (info.kind === 'vite') ok('Vite needs no extra file for production: vite build && vite preview serve Sourcepeek too.');
    else fail('Production mode is supported for Next.js and Vite only.');
    return info.kind === 'vite';
  }
  const existing = PROD_ROUTE_FILES.map((f) => path.join(cwd, f)).find((f) => fs.existsSync(f));
  if (existing) {
    const txt = fs.readFileSync(existing, 'utf8');
    if (/sourcepeek\/next\/route/.test(txt) && /export const (runtime|dynamic)\b/.test(txt)) {
      fs.writeFileSync(existing, `export { GET, POST } from 'sourcepeek/next/route';\n`);
      ok(`Updated ${rel(existing)} (removed runtime/dynamic exports, which break builds with cacheComponents)`);
    } else ok(`${rel(existing)} already exists`);
    return true;
  }
  const target = prodRouteTarget();
  if (!target) {
    fail('Could not find an app/ or pages/ folder.');
    return false;
  }
  fs.mkdirSync(path.dirname(target.file), { recursive: true });
  fs.writeFileSync(target.file, target.code);
  ok(`Created ${rel(target.file)} (the production backend route)`);
  console.log(c.d('  It answers 404 on deployments unless SOURCEPEEK_ENABLE_PROD=1 and SOURCEPEEK_TOKEN are set; then it is locked until you enter the token.'));
  console.log(`\n${c.b('Production / Vercel (optional):')} commit this file. To use Sourcepeek on a deployment, set ${c.m('SOURCEPEEK_ENABLE_PROD=1')} and ${c.m('SOURCEPEEK_TOKEN')} (run ${c.b('npx sourcepeek token')}), redeploy, and open the site with ${c.b('?sourcepeek')} to unlock it.\n`);
  return true;
}

function removeProdRoute() {
  for (const f of PROD_ROUTE_FILES) {
    const p = path.join(cwd, f);
    if (!fs.existsSync(p)) continue;
    if (!/sourcepeek\/next\/(route|api)/.test(fs.readFileSync(p, 'utf8'))) continue;
    fs.unlinkSync(p);
    ok(`Removed ${rel(p)}`);
    let dir = path.dirname(p);
    while (dir.startsWith(cwd) && dir !== cwd && /sourcepeek|\[\.\.\.path\]/.test(path.basename(dir))) {
      try {
        if (fs.readdirSync(dir).length) break;
        fs.rmdirSync(dir);
      } catch {
        break;
      }
      dir = path.dirname(dir);
    }
  }
}

function setup() {
  console.log(`\n🔥 ${c.b('Sourcepeek setup')}\n`);
  const info = detect();
  if (info.kind === 'none') return fail('No package.json here — run this from your project root.');

  cleanupLegacyBabel();

  let done = false;
  if (info.kind === 'next') done = setupNext(info);
  else if (info.kind === 'angular') done = setupAngular(info);
  else if (info.kind === 'vite') done = setupVite(info);
  else if (info.kind === 'nuxt') fail('Nuxt is not supported yet.');
  else if (info.kind === 'cra') fail('Create React App is not supported (it is deprecated). Vite and Next.js are.');
  else fail('Could not detect Next.js, Vite or the Angular CLI in this project.');

  if (done && info.kind === 'next') setupNextAutoMount();
  if (done && (info.kind === 'next' || process.argv.includes('--prod'))) done = setupProd(info);
  if (done) printUsage(info);
  else process.exitCode = 1;
}

function remove() {
  console.log(`\n🔥 ${c.b('Sourcepeek remove')}\n`);
  for (const f of [...NEXT_CONFIGS, ...VITE_CONFIGS]) removeFrom(path.join(cwd, f));
  removeProdRoute();
  removeNextAutoMount();
  removeAngular();
  const left = leftoverMounts();
  if (left.length) console.log(c.d(`\nAlso delete the sourcepeek import from ${left.join(', ')}.`));
  console.log(c.d('\nThen: npm uninstall sourcepeek\n'));
}

function doctor() {
  console.log(JSON.stringify(detect(), null, 2));
}

async function token() {
  const { randomBytes } = await import('crypto');
  const t = randomBytes(24).toString('base64url');
  console.log(`\n${c.b('A new production token')} — put both lines in your deployment's environment variables (not in git):\n`);
  console.log(`   ${c.m('SOURCEPEEK_ENABLE_PROD=1')}`);
  console.log(`   ${c.m('SOURCEPEEK_TOKEN=' + t)}\n`);
  console.log(c.d('Then open the deployed site with ?sourcepeek in the URL and enter the token. Changing it logs every browser out.\n'));
}

const cmd = process.argv[2] || 'setup';
if (cmd === 'setup' || cmd === 'init') setup();
else if (cmd === 'remove' || cmd === 'uninstall') remove();
else if (cmd === 'doctor') doctor();
else if (cmd === 'token') token();
else if (cmd === 'mcp') {
  if (process.argv.includes('--setup') || process.argv[3] === 'setup') {
    const { setupMcp } = await import('../src/mcp/setup.js');
    setupMcp(cwd, { c, ok, warn, fail, only: process.argv.slice(3).filter((a) => !a.startsWith('-') && a !== 'setup') });
  } else {
    const { runMcpServer } = await import('../src/mcp/server.js');
    await runMcpServer({ root: process.argv.includes('--root') ? path.resolve(process.argv[process.argv.indexOf('--root') + 1]) : cwd });
  }
} else {
  console.log('Usage: npx sourcepeek <setup [--prod] | remove | doctor | token | mcp [setup]>');
  process.exitCode = 1;
}
