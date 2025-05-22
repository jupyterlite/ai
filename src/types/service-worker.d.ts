/**
 * Type declarations for Service Worker APIs not included in standard TypeScript libs
 */
interface ExtendableMessageEvent extends MessageEvent {
  waitUntil(f: Promise<any>): void;
}
