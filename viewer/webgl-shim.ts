/**
 * Node.js / SSR compatibility shim for WebGL2RenderingContext constants
 * required by sigma/rendering module initialization.
 */
if (typeof (globalThis as any).WebGL2RenderingContext === "undefined") {
  (globalThis as any).WebGL2RenderingContext = {
    BOOL: 0x8b56,
    BYTE: 0x1400,
    UNSIGNED_BYTE: 0x1401,
    SHORT: 0x1402,
    UNSIGNED_SHORT: 0x1403,
    INT: 0x1404,
    UNSIGNED_INT: 0x1405,
    FLOAT: 0x1406,
  };
}

export {};
