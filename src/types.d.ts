interface Navigator { locks: LockManager; }
declare var idb: { openDB: (name: string, version: number, callbacks: any) => Promise<any> };
declare var Papa: any;
interface Window {
  SimpleQRCode?: { toSvg(text: string, options?: { border?: number; ariaLabel?: string }): string };
}
