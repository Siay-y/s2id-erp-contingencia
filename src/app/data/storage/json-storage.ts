import { DOCUMENT, Injectable, inject, signal } from '@angular/core';
import { StorageKey } from './storage-keys';

export type StorageFailureReason = 'quota' | 'unavailable' | 'unknown';

/**
 * Leitura e escrita tipadas em JSON sobre o `localStorage`.
 *
 * No servidor (SSR), em navegação privada restrita ou com o armazenamento
 * cheio, os dados passam a viver em memória: a sessão continua funcionando e
 * `failure()` avisa a interface de que a gravação não chegou ao disco.
 */
@Injectable({ providedIn: 'root' })
export class JsonStorage {
  private readonly window = inject(DOCUMENT).defaultView;
  private readonly memory = new Map<StorageKey, string>();

  readonly failure = signal<StorageFailureReason | null>(null);

  // Declarado depois de `failure`: `resolveStorage` já pode reportar falha.
  private readonly storage: Storage | null = this.resolveStorage();

  get isPersistent(): boolean {
    return this.storage !== null;
  }

  read<T>(key: StorageKey): T | null {
    const raw = this.memory.get(key) ?? this.storage?.getItem(key) ?? null;
    if (raw === null) return null;

    try {
      return JSON.parse(raw) as T;
    } catch {
      // JSON corrompido: descarta para que o repositório volte ao seed em vez de derrubar o app.
      this.remove(key);
      return null;
    }
  }

  write(key: StorageKey, value: unknown): boolean {
    const raw = JSON.stringify(value);

    if (!this.storage) {
      this.memory.set(key, raw);
      return false;
    }

    try {
      this.storage.setItem(key, raw);
      this.memory.delete(key);
      return true;
    } catch (error) {
      this.memory.set(key, raw);
      this.failure.set(isQuotaError(error) ? 'quota' : 'unknown');
      return false;
    }
  }

  remove(key: StorageKey): void {
    this.memory.delete(key);
    this.storage?.removeItem(key);
  }

  /** O evento `storage` só dispara em outras abas, nunca na que gravou. */
  watch(keys: readonly StorageKey[], listener: () => void): () => void {
    const target = this.window;
    if (!target || !this.storage) return () => undefined;

    const handler = (event: StorageEvent): void => {
      if (event.key === null || (keys as readonly string[]).includes(event.key)) listener();
    };

    target.addEventListener('storage', handler);
    return () => target.removeEventListener('storage', handler);
  }

  private resolveStorage(): Storage | null {
    try {
      const storage = this.window?.localStorage;
      if (!storage) return null;

      const probe = '__s2id_probe__';
      storage.setItem(probe, probe);
      storage.removeItem(probe);
      return storage;
    } catch {
      this.failure.set('unavailable');
      return null;
    }
  }
}

function isQuotaError(error: unknown): boolean {
  return (
    error instanceof DOMException &&
    (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED')
  );
}
