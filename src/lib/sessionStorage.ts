import type { SessionStorage } from '@accesly/core';
import type { AuthTokens } from '@accesly/core';

/**
 * Persiste los tokens Cognito en `window.localStorage`. Trade-off conocido:
 * un XSS en la app podría leer estos tokens. Para esta app de demo en
 * localhost es aceptable; en producción real conviene moverse a httpOnly
 * cookies + backend session (o al menos a sessionStorage si querés
 * limitarlos al tab actual).
 *
 * El SDK por default usa `InMemorySessionStorage`, lo cual significa que un
 * page reload (F5, click en un `<a href>`, etc.) tira la sesión y obliga a
 * relogin. Esta clase resuelve ese caso.
 */
const KEY = 'accesly-example:session';

export class BrowserSessionStorage implements SessionStorage {
  load(): AuthTokens | null {
    try {
      const raw = window.localStorage.getItem(KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as AuthTokens;
      if (!parsed.idToken || typeof parsed.expiresAt !== 'number') return null;
      return parsed;
    } catch {
      return null;
    }
  }

  save(tokens: AuthTokens): void {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(tokens));
    } catch {
      /* quota or disabled */
    }
  }

  clear(): void {
    try {
      window.localStorage.removeItem(KEY);
    } catch {
      /* no-op */
    }
  }
}
