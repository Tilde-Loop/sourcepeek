export interface SourcepeekNextOptions {
  /** Mount the inspector without rendering <Sourcepeek /> in your layout. Default: true. */
  autoMount?: boolean;
}
export declare function withSourcepeek<T>(config: T, options?: SourcepeekNextOptions): T;
export default withSourcepeek;
