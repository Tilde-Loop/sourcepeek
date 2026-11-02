// Angular autoMount: `npx sourcepeek setup` adds this to the polyfills of the development build in angular.json, so
// provideSourcepeek() isn't needed. Polyfills run before Angular creates its zone, so Sourcepeek's own mouse and click
// listeners never trigger change detection. Once the app has bootstrapped, change detection cycles are bridged for
// "Renders & state" through the app's root injector (dev-mode debug API).
import * as ng from '@angular/core';
import './auto.js';
import { bridgeChangeDetection } from './angular.js';

function bridgeWhenBootstrapped(tries = 0) {
  const debug = window.ng;
  const rootEl = document.querySelector('[ng-version]');
  if (rootEl && debug && typeof debug.getInjector === 'function') {
    try {
      const appRef = debug.getInjector(rootEl).get(ng.ApplicationRef);
      ng.runInInjectionContext(appRef.injector, bridgeChangeDetection);
    } catch {}
    return;
  }
  if (tries < 300) setTimeout(() => bridgeWhenBootstrapped(tries + 1), 100);
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') bridgeWhenBootstrapped();
