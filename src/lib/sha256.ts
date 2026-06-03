export async function sha256(data: Uint8Array): Promise<Uint8Array> {
  // The lib.dom Uint8Array generic changed to require ArrayBuffer; copying to
  // a fresh ArrayBuffer satisfies BufferSource regardless of TS lib version.
  const owned = new Uint8Array(data.byteLength);
  owned.set(data);
  const buf = await crypto.subtle.digest('SHA-256', owned.buffer);
  return new Uint8Array(buf);
}

export async function sha256Hex(data: string): Promise<string> {
  const bytes = await sha256(new TextEncoder().encode(data));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
