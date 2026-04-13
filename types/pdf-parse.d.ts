// Minimal ambient declaration for pdf-parse.
// The package ships no types and @types/pdf-parse is stale.
// We only use the default export with { text: string } — shim accordingly.

declare module 'pdf-parse' {
  interface PdfParseResult {
    text: string
    numpages: number
    info: unknown
    metadata: unknown
    version: string
  }

  function pdfParse(
    dataBuffer: Buffer | Uint8Array | ArrayBuffer,
    options?: Record<string, unknown>,
  ): Promise<PdfParseResult>

  export default pdfParse
}
