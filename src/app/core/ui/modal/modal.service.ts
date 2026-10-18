import { Injectable, computed, signal } from '@angular/core';
import {
  AlertModalOptions,
  ConfirmModalOptions,
  MODAL_VARIANT_ICONS,
  ModalConfig,
  ModalInstance,
  ResolvedModalConfig,
} from './modal.model';

const CONFIRM = 'confirm';
const CANCEL = 'cancel';
const OK = 'ok';

/**
 * Fila de modais nativas. Uma modal aberta enquanto outra está na tela espera
 * a vez, em vez de sobrescrever a primeira: um erro que surge durante uma
 * confirmação não apaga a pergunta que o operador ainda não respondeu.
 */
@Injectable({ providedIn: 'root' })
export class ModalService {
  private readonly queue = signal<readonly ModalInstance[]>([]);
  private nextId = 1;

  readonly active = computed(() => this.queue()[0] ?? null);
  readonly isOpen = computed(() => this.active() !== null);
  readonly pendingCount = computed(() => Math.max(0, this.queue().length - 1));

  /** Resolve com o `id` da ação escolhida, ou `null` se a modal for dispensada. */
  open<T extends string>(config: ModalConfig<T>): Promise<T | null> {
    return new Promise<T | null>((resolve) => {
      const instance: ModalInstance = {
        id: this.nextId++,
        config: resolveConfig(config),
        resolve: (actionId) => resolve(actionId as T | null),
      };
      this.queue.update((queue) => [...queue, instance]);
    });
  }

  async confirm(options: ConfirmModalOptions): Promise<boolean> {
    const result = await this.open({
      title: options.title,
      message: options.message,
      variant: options.variant ?? 'info',
      eyebrow: options.eyebrow,
      icon: options.icon,
      details: options.details,
      bulletsTitle: options.bulletsTitle,
      bullets: options.bullets,
      size: options.size,
      dismissible: true,
      actions: [
        { id: CANCEL, label: options.cancelLabel ?? 'Cancelar', appearance: 'text' },
        {
          id: CONFIRM,
          label: options.confirmLabel ?? 'Confirmar',
          icon: options.confirmIcon,
          appearance: 'filled',
          destructive: options.destructive,
          autofocus: true,
        },
      ],
    });
    return result === CONFIRM;
  }

  async alert(options: AlertModalOptions): Promise<void> {
    await this.open({
      title: options.title,
      message: options.message,
      variant: options.variant ?? 'info',
      eyebrow: options.eyebrow,
      icon: options.icon,
      details: options.details,
      bulletsTitle: options.bulletsTitle,
      bullets: options.bullets,
      size: options.size,
      dismissible: true,
      actions: [
        { id: OK, label: options.okLabel ?? 'Entendi', appearance: 'filled', autofocus: true },
      ],
    });
  }

  /** Fecha a modal da vez com a ação escolhida e passa para a próxima da fila. */
  choose(actionId: string): void {
    this.settle(actionId);
  }

  /** ESC, fundo e botão de fechar. Ignorado quando a modal exige resposta. */
  dismiss(): void {
    if (this.active()?.config.dismissible) this.settle(null);
  }

  closeAll(): void {
    const pending = this.queue();
    this.queue.set([]);
    for (const instance of pending) instance.resolve(null);
  }

  private settle(actionId: string | null): void {
    const current = this.active();
    if (!current) return;

    this.queue.update((queue) => queue.slice(1));
    current.resolve(actionId);
  }
}

function resolveConfig<T extends string>(config: ModalConfig<T>): ResolvedModalConfig {
  const variant = config.variant ?? 'info';
  const actions = config.actions?.length
    ? config.actions
    : [{ id: OK, label: 'Fechar', appearance: 'filled' as const, autofocus: true }];

  return {
    ...config,
    variant,
    icon: config.icon ?? MODAL_VARIANT_ICONS[variant],
    dismissible: config.dismissible ?? true,
    size: config.size ?? 'md',
    actions,
  };
}
