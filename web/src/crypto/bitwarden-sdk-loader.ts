/// <reference path="../types/wasm.d.ts" />
import * as sdk from "@bitwarden/sdk-internal";

let sdkReady: Promise<void> | undefined;

/**
 * Load the Bitwarden SDK's official WASM build once before using BitwardenCryptoProvider
 * in a browser. The Web application must use a bundler that handles .wasm imports,
 * as Proton's official Web client does.
 */
export function initializeBitwardenCryptoSdk(): Promise<void> {
  if (sdkReady) return sdkReady;
  sdkReady = (async () => {
    const wasmModule = await import("@bitwarden/sdk-internal/bitwarden_wasm_internal_bg.wasm");
    (sdk as any).init(wasmModule);
    sdk.init_sdk(sdk.LogLevel.Info);
  })().catch((error) => {
    sdkReady = undefined;
    throw new Error("Unable to initialize Bitwarden cryptography WASM.", { cause: error });
  });
  return sdkReady;
}
