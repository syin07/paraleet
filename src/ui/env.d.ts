import type { ParaLeetApi } from '../bridge/contract';

declare global {
  interface Window {
    /** Set by the Electron preload script. Missing in a plain browser, where the mock is used. */
    paraleet?: ParaLeetApi;
  }
}

export {};
