declare module "@bitwarden/sdk-internal/bitwarden_wasm_internal_bg.wasm" {
  const wasmModule: WebAssembly.Exports;
  export = wasmModule;
}
