export async function sha256(data: Uint8Array): Promise<Uint8Array> {
  const buf = await crypto.subtle.digest('SHA-256', data);
  return new Uint8Array(buf);
}

export async function sha256Hex(data: string): Promise<string> {
  const bytes = await sha256(new TextEncoder().encode(data));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
