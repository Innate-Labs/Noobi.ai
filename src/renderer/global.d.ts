import type { NoobiApi } from '../shared/contracts';

declare global {
  interface Window {
    noobi: NoobiApi;
  }
}

export {};
