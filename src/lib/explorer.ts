/**
 * Construye un link al explorer para un Smart Account de Accesly.
 *
 * Los Smart Accounts son contratos Soroban con address `C...` (testnet).
 */
export function explorerUrlForContract(
  address: string,
  network: 'testnet' | 'mainnet' = 'testnet',
): string {
  return `https://stellar.expert/explorer/${network}/contract/${address}`;
}

export function shortAddress(address: string, head = 6, tail = 4): string {
  if (address.length <= head + tail + 1) return address;
  return `${address.slice(0, head)}…${address.slice(-tail)}`;
}
