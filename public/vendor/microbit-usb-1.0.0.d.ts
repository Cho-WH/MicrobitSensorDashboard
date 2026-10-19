// App-used API subset of @microbit/microbit-connection 1.0.0's official declarations.
// Source: build/esm/{device,usb/connection,universal-hex/flash-data-source}.d.ts.
// (c) 2021 Micro:bit Educational Foundation and contributors, MIT.
// Full bundled license text is preserved in microbit-usb-LICENSES.md.
export type BoardVersion = 'V1' | 'V2';
export type FlashDataSource = (boardVersion: BoardVersion) => Promise<string | Uint8Array>;
export type ProgressStage = 'Initializing' | 'FindingDevice' | 'CheckingBond' |
  'ResettingDevice' | 'Connecting' | 'PartialFlashing' | 'FullFlashing';
export type ProgressCallback = (stage: ProgressStage, progress?: number) => void;
export interface FlashOptions {
  partial?: boolean;
  progress?: ProgressCallback;
  minimumProgressIncrement?: number;
  signal?: AbortSignal;
}
export interface MicrobitUSBConnection {
  readonly type: 'usb';
  initialize(): Promise<void>;
  connect(options?: { progress?: ProgressCallback; signal?: AbortSignal; bondMode?: 'pairing' | 'application' | 'none' }): Promise<void>;
  getBoardVersion(): BoardVersion;
  getDevice(): { readonly productName?: string } | undefined;
  flash(dataSource: FlashDataSource, options: FlashOptions): Promise<void>;
  disconnect(): Promise<void>;
  dispose(): void;
}
export declare function createUSBConnection(options?: {
  pauseOnHidden?: boolean;
  deviceSelectionMode?: 'AlwaysAsk' | 'UseAnyAllowed';
}): MicrobitUSBConnection;
export declare function createUniversalHexFlashDataSource(universalHex: string): FlashDataSource;
