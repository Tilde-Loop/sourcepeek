import type { Plugin } from 'vite';
export interface SourcepeekViteOptions {
  /** Mount the inspector without rendering <Sourcepeek /> in your app. Default: true. */
  autoMount?: boolean;
}
declare function sourcepeek(options?: SourcepeekViteOptions): Plugin;
export default sourcepeek;
export { sourcepeek };
