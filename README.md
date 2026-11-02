# Sourcepeek

Click any element in dev mode to see its source file, line, component chain, props, state and git history. Alt+click opens it in your editor. Describe a change in plain words and Sourcepeek previews it or writes it into your code, with a diff and undo.

Works with **React (Vite)**, **Next.js** (webpack and Turbopack), **Vue 3**, **Svelte / SvelteKit** and **Angular** (16+, Angular CLI).

## Quick start

```bash
npm i -D sourcepeek@latest
npx sourcepeek setup
```

Restart your dev server. That's it: Sourcepeek mounts itself, so there is nothing to add to your layout or app code.

Click **“Sourcepeek: OFF”** in the bottom-right corner to turn inspect mode on, then click an element. `Esc` closes panels and exits inspect mode.

### How it mounts

| Project | How |
| --- | --- |
| Vite (React, Vue, Svelte) | `sourcepeek()` in `vite.config.*` adds a script to `index.html` |
| SvelteKit | `sourcepeek()` in `vite.config.*` adds it to SvelteKit's client entry |
| Next.js 15.3+ | `withSourcepeek()` in `next.config.*`, plus `instrumentation-client.ts` with `import 'sourcepeek/next/auto'` |
| Next.js before 15.3 (webpack) | `withSourcepeek()` adds it to webpack's client entry |
| Angular CLI | `sourcepeek/angular/auto` in the `polyfills` of the development build in `angular.json` |

### Render it yourself instead

To decide where and when Sourcepeek appears (for example only for some users in production), turn autoMount off:

```js
// vite.config.js
plugins: [sourcepeek({ autoMount: false }), react()]

// next.config.mjs
export default withSourcepeek(nextConfig, { autoMount: false });
```

Then render the component once:

```tsx
import Sourcepeek from 'sourcepeek/react';   // React, Next.js layout or _app
<Sourcepeek />
```

```vue
<script setup>
import Sourcepeek from 'sourcepeek/vue';
</script>
<template><Sourcepeek /></template>
```

```svelte
<script>
  import Sourcepeek from 'sourcepeek/svelte';
</script>
<Sourcepeek />
```

Angular: remove `sourcepeek/angular/auto` from the polyfills in `angular.json` and add `provideSourcepeek()` (from `sourcepeek/angular`) to your app providers.

A `<Sourcepeek />` or `provideSourcepeek()` left over from an earlier setup keeps working next to autoMount, with one shared panel. You can delete it.

## Inspect panel

- **File and line** of the element, plus **Copy file:line** and **Open in…** your editor.
- **Component chain**: `App › Layout › Header › Button`. Click a crumb to inspect it.
- **Used in**: where this component is rendered (the call-site).
- **Props** of the component (Angular: its inputs).
- **Value source**: where the shown value comes from (see [Value source](#value-source)).
- **Translations**: the i18n key, file and line behind a text.
- **Git**: branch and who last changed the line.

| Shortcut | What it does |
| --- | --- |
| **Alt + click** | Opens the element's file at its line in your editor. |
| **Alt + Shift + click** | Copies `src/components/Button.tsx:12`. |

Supported editors: VS Code, Cursor, Windsurf, VS Code Insiders, Zed, WebStorm, IntelliJ IDEA. Set a default with `SOURCEPEEK_IDE`.

## More view

**More →** in the panel opens these sections. AI sections need an [API key](#ai-features-optional).

| Section | What it does |
| --- | --- |
| **Summary** | AI description of the component and its potential issues. |
| **Change with AI** | Describe a change; preview it, then apply it to your code. See [Change with AI](#change-with-ai). |
| **Renders & state** | Timeline of what changed on each render, and the current props and state. |
| **Network** | Requests the component makes, from the code and live, with mocking. |
| **Storage** | localStorage, sessionStorage and Cache Storage keys the component uses. |
| **Accessibility** | Checks the element and its component, with file:line and *Fix with AI*. |
| **Web Vitals** | LCP, CLS and INP, pointed at the file and line that caused them. |
| **Meta tags** | SEO basics for the page: title, description, h1, canonical, Open Graph. |
| **Refactor** | AI refactoring suggestion for the component. |
| **Report** | One Markdown bug report with screenshot, file:line, props, errors and requests. |

The **$** button shows what Sourcepeek's AI calls have cost in this project.

## Renders & state

Follows the component you opened and lists what changed on each render, e.g. `price 120 → 99 (prop)`. Renders where nothing changed are listed too, to spot wasted re-renders. **Current values** shows props and state as expandable trees.

| Framework | What is counted |
| --- | --- |
| React | Re-renders (exact, via the DevTools hook) |
| Vue | Component updates |
| Angular | Change detection checks |
| Svelte 5 | DOM updates (rough) |

If React shows *sampled*, add `import 'sourcepeek/react-hook'` as the first import of your entry file.

## Value source

Shows where a displayed value comes from, without an AI key:

```
“€120” in <span>
← prop price of <ProductCard>
← passed by <Page> at src/Page.tsx:42 as price={item.price}
← state data.items[3].price of <Page>
← GET /api/products 200 → items[3].price
```

Works with React, Vue and Angular.

## Web Vitals

Measures LCP, CLS and INP in your browser and shows the element, source line and cause behind each (the LCP image, the element that caused a shift, the slow handler). Full support in Chrome and Edge.

## Coding agents (MCP)

Lets Claude Code, Cursor, VS Code and other agents see the element you clicked. Click it, then tell your agent “fix this”.

```bash
npx sourcepeek mcp setup
```

Or add it yourself: the command is `npx sourcepeek mcp` (stdio).

```bash
claude mcp add sourcepeek -- npx sourcepeek mcp
```

| Tool | Returns |
| --- | --- |
| `get_selection` | The inspected element: file:line, call-site, chain, props, state, value source, HTML, source. |
| `get_selection_history` | The last 20 inspected elements. |
| `get_console_errors` | Console errors, uncaught errors, failed resources. |
| `get_network_requests` | The page's requests, with status, timing and payloads. |
| `get_web_vitals` | LCP, CLS and INP with their file:line. |
| `get_page_context` | URL, title, viewport, browser, active mocks. |

Data stays on your machine (`node_modules/.cache/sourcepeek/mcp/`), and secrets are redacted. In a monorepo, use `npx sourcepeek mcp --root apps/web`.

## Network

Lists the requests a component can make (found in the code: `fetch`, axios, ky, SWR…) and the ones it made (captured live), with payloads and responses.

- **Send request** and **Copy cURL**.
- **Mock this**: answer a request with your own status, body or delay.
- **Randomise**: the AI writes realistic data for the request and mocks it.

Active mocks are shown in a bar at the bottom of the page and are kept until you clear them or close the tab.

## Storage

Shows the localStorage, sessionStorage and Cache Storage keys the component uses, found in the code and captured live, plus everything else the page stores. You can view, edit and remove values. Secrets are masked.

## Accessibility

Checks for missing alt text, unlabelled buttons and fields, low contrast, skipped headings and keyboard problems. Each finding links to its file and line, and **Fix with AI** previews a fix.

## Meta tags (SEO)

Checks title, meta description, h1, canonical, Open Graph, `lang` and `noindex`, and flags values that only exist after JavaScript runs.

## Bug report

**More → Report** builds one Markdown block with a screenshot, component and file:line, props and state, URL, failed requests, console errors, browser info and recent clicks. Secrets are redacted.

## AI features (optional)

Add a key for any supported provider to `.env.local` (or `.env`):

| Provider | Key | Default model |
| --- | --- | --- |
| OpenAI | `OPENAI_API_KEY` | `gpt-4.1-mini` |
| Claude (Anthropic) | `ANTHROPIC_API_KEY` | `claude-haiku-5-5` |
| Gemini | `GEMINI_API_KEY` or `GOOGLE_GENERATIVE_AI_API_KEY` | `gemini-3.8-flash` |
| Mistral | `MISTRAL_API_KEY` | `mistral-small-latest` |
| Groq | `GROQ_API_KEY` | `llama-3.3-70b-versatile` |
| DeepSeek | `DEEPSEEK_API_KEY` | `deepseek-chat` |
| OpenRouter | `OPENROUTER_API_KEY` | `openrouter/auto` |
| Ollama (local) | none, detected when running | first installed model |

If several keys are present, the first one in this table wins. Overrides:

```
SOURCEPEEK_AI_PROVIDER=anthropic
SOURCEPEEK_AI_MODEL=claude-sonnet-5-5
```

Other OpenAI-compatible services work with `SOURCEPEEK_AI_BASE_URL`, `SOURCEPEEK_AI_MODEL` and `SOURCEPEEK_AI_API_KEY`. Only API keys work, not chat subscriptions.

## Change with AI

Describe what you want and click **Preview**:

- **Visual changes** are previewed live as CSS.
- **Other changes** (text, logic, new components, new pages) are previewed as a diff.

Nothing is written until you click **Apply to code**. **Undo** restores the previous files.

Sourcepeek detects the kind of change (style, reorder, code, theme, new component, new page) and puts it in the right place for your styling: Tailwind classes, CSS Modules, SCSS, styled-components, Vue/Svelte `<style>`, and so on. You can pick the kind yourself in the **Auto-detect** menu.

Safety:

- Only on your local dev server, only for requests from this computer.
- Only writes inside the project, never `node_modules`. New files never overwrite existing ones.
- Every change is syntax-checked before it is written.
- If a change breaks the page, a red bar offers **Revert change**.

Turn it off with `SOURCEPEEK_EDITS=0`.

## Angular

`npx sourcepeek setup` points `ng serve` at `sourcepeek.proxy.mjs`, which starts the backend and keeps your existing proxy config, and adds `sourcepeek/angular/auto` to the development build's polyfills, so Sourcepeek mounts itself. Restart `ng serve`. **File** is the template, **Class** is the component class. Works on `ng serve` only.

## What `npx sourcepeek setup` changes

Only config files, never your components or layouts:

| Project | Change |
| --- | --- |
| Vite (React, Vue, Svelte, SvelteKit) | adds `sourcepeek()` to `plugins` in `vite.config.*` |
| Next.js | wraps the export of `next.config.*` in `withSourcepeek(...)`, creates the production API route, and on 15.3+ creates `instrumentation-client.*` (or adds one line to yours) |
| Angular CLI | sets `proxyConfig` in `angular.json` to `sourcepeek.proxy.mjs`, and adds `sourcepeek/angular/auto` to the development `polyfills` |

Safe to run more than once. Undo it with `npx sourcepeek remove`.

## Manual setup

```js
// vite.config.js
import sourcepeek from 'sourcepeek/vite';
export default defineConfig({ plugins: [sourcepeek(), react()] });
```

```js
// next.config.mjs
import { withSourcepeek } from 'sourcepeek/next';
export default withSourcepeek(nextConfig);
```

```js
// instrumentation-client.ts (Next.js 15.3+, next to app/, or in src/)
import 'sourcepeek/next/auto';
```

```jsonc
// angular.json → projects.<app>.architect.build.configurations.development
"polyfills": ["zone.js", "sourcepeek/angular/auto"]
```

## How it works

- **Tagging (dev only).** Elements get `data-mf-*` attributes with their file and line. Svelte and Angular need no tagging.
- **Backend.** Served at `/__sourcepeek/*` by your dev server (on Next.js and Angular, a small localhost server behind a rewrite or proxy).
- **Mounting.** The plugin in your config loads the panel (autoMount), so your app code stays untouched.
- **UI.** A panel in Shadow DOM, so your app's CSS can't affect it.

## Production

Off by default. To use Sourcepeek on a deployment:

1. Set **`SOURCEPEEK_ENABLE_PROD=1`** (at build time and at runtime).
2. Set **`SOURCEPEEK_TOKEN`** to a secret of 16+ characters (`npx sourcepeek token` makes one).
3. Open the site with **`?sourcepeek`** and enter the token.

Without `SOURCEPEEK_ENABLE_PROD`, nothing is added to the build. Until unlocked, the backend answers `401`. Next.js needs the API route that `npx sourcepeek setup` creates; commit it. *Apply to code* and MCP never run in production.

| Variable | Purpose |
| --- | --- |
| `SOURCEPEEK_GITHUB_TOKEN` | Git history on Vercel (needed for private repos). |
| `SOURCEPEEK_GITHUB_REPO` | `owner/repo`, when there is no `.git` folder outside Vercel. |
| `SOURCEPEEK_GITHUB_PATH_PREFIX` | Folder of the app inside the repo, for monorepos. |

## Security

- Production is off unless opted in, and locked with a token.
- Endpoints need an `x-sourcepeek` header, so other websites can't call them.
- The dev backend answers only this computer, and only for `localhost`, `*.localhost`, IP addresses or `SOURCEPEEK_ALLOWED_HOSTS` (this blocks DNS rebinding).
- Only source files inside the project (or `SOURCEPEEK_SOURCE_ROOTS`), outside `node_modules`, can be read.

## Environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `SOURCEPEEK_IDE` | `vscode` | Default editor for Alt+click. |
| `SOURCEPEEK_EDITS` | on | `0` disables *Apply to code*. |
| `SOURCEPEEK_ALLOW_REMOTE` | off | `1` allows other devices (LAN, Docker, tunnels). |
| `SOURCEPEEK_ALLOW_REMOTE_EDITS` | off | `1` also allows *Apply to code* from other devices. |
| `SOURCEPEEK_ALLOWED_HOSTS` | — | Extra dev host names, comma separated (`.example.test` for subdomains). |
| `SOURCEPEEK_SOURCE_ROOTS` | — | Extra readable folders, relative to the project (monorepos). |
| `SOURCEPEEK_AI_PRICE` | built-in | `input,output` USD per 1M tokens, for the **$** estimate. |
| `SOURCEPEEK_CALLSITES` | on | `0` stops tagging component usages. |
| `SOURCEPEEK_DISABLE` | off | `1` turns Sourcepeek off everywhere. |
| `SOURCEPEEK_ENABLE_PROD` | off | `1` runs Sourcepeek in production builds. |
| `SOURCEPEEK_TOKEN` | — | Secret that unlocks production (16+ characters). |

## Troubleshooting

- **No button appears.** Check the console. `backend not found at /__sourcepeek` means setup didn't run or the dev server wasn't restarted. `npx sourcepeek doctor` shows what was detected.
- **No button with React Router (framework mode), Astro or another Vite framework without `index.html`.** autoMount needs `index.html` (or SvelteKit). Render `<Sourcepeek />` yourself.
- **No button on Next.js with Turbopack.** autoMount needs `instrumentation-client` with `import 'sourcepeek/next/auto'` (Next.js 15.3+): run `npx sourcepeek setup` again. Before 15.3, render `<Sourcepeek />` in your layout.
- **403 Forbidden: host … is not allowed.** Add the host to `SOURCEPEEK_ALLOWED_HOSTS`. From another device, Docker or a tunnel, also set `SOURCEPEEK_ALLOW_REMOTE=1`.
- **Sourcepeek is gone after deploying.** Production is opt-in: set `SOURCEPEEK_ENABLE_PROD=1` and `SOURCEPEEK_TOKEN`.
- **The agent says nothing is selected.** Inspect an element with the dev server running, and start the agent in the project folder (or use `--root`).
- **“Apply to code” is greyed out.** Hover it to see why.
- **Data looks wrong.** A mock may still be active: check the bar at the bottom of the page.
- **Angular: “Could not find the source of this element”.** The element is from a library, or `ng serve` runs a production configuration.
- **Turbopack + JSX in `.js` files.** Under Turbopack, only `.jsx` and `.tsx` are tagged.

## License

MIT
