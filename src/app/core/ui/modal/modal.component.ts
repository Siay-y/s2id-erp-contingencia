import {
  ChangeDetectionStrategy,
  Component,
  DOCUMENT,
  ElementRef,
  afterRenderEffect,
  computed,
  effect,
  inject,
  viewChild,
} from '@angular/core';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MODAL_VARIANT_TONES } from './modal.model';
import { ModalService } from './modal.service';

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Host único das modais, montado uma vez no `App`. Renderiza a modal da vez
 * da fila do `ModalService`, prende o foco dentro dela e devolve o foco ao
 * elemento que a abriu quando a fila esvazia.
 */
@Component({
  selector: 'app-modal',
  imports: [MatButton, MatIconButton, MatIcon],
  templateUrl: './modal.component.html',
  styleUrl: './modal.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:keydown)': 'onKeydown($event)',
  },
})
export class ModalComponent {
  private readonly modal = inject(ModalService);
  private readonly document = inject(DOCUMENT);
  private readonly dialog = viewChild<ElementRef<HTMLElement>>('dialog');

  // Lista de no máximo um item: o `track` por id faz a troca de modal animar a saída e a entrada.
  protected readonly stack = computed(() => {
    const active = this.modal.active();
    return active ? [active] : [];
  });

  protected readonly pendingCount = this.modal.pendingCount;
  protected readonly tones = MODAL_VARIANT_TONES;

  private focusedModalId: number | null = null;
  private returnFocusTo: HTMLElement | null = null;

  constructor() {
    effect(() => {
      this.document.body.classList.toggle('modal-open', this.modal.isOpen());
    });

    afterRenderEffect(() => {
      const active = this.modal.active();
      const dialog = this.dialog()?.nativeElement;

      if (!active) {
        if (this.focusedModalId !== null) this.restoreFocus();
        return;
      }
      if (!dialog || this.focusedModalId === active.id) return;

      if (this.focusedModalId === null) {
        this.returnFocusTo = this.document.activeElement as HTMLElement | null;
      }
      this.focusedModalId = active.id;

      const target =
        dialog.querySelector<HTMLElement>('[data-autofocus]') ??
        [...dialog.querySelectorAll<HTMLElement>('.modal__actions button')].at(-1) ??
        dialog;
      target.focus();
    });
  }

  protected choose(actionId: string): void {
    this.modal.choose(actionId);
  }

  protected dismiss(): void {
    this.modal.dismiss();
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (!this.modal.isOpen()) return;

    if (event.key === 'Escape') {
      event.preventDefault();
      this.modal.dismiss();
      return;
    }
    if (event.key === 'Tab') this.trapFocus(event);
  }

  private trapFocus(event: KeyboardEvent): void {
    const dialog = this.dialog()?.nativeElement;
    if (!dialog) return;

    const focusable = [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE)];
    if (focusable.length === 0) {
      event.preventDefault();
      dialog.focus();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const current = this.document.activeElement;

    if (event.shiftKey && (current === first || !dialog.contains(current))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (current === last || !dialog.contains(current))) {
      event.preventDefault();
      first.focus();
    }
  }

  private restoreFocus(): void {
    const target = this.returnFocusTo;
    this.focusedModalId = null;
    this.returnFocusTo = null;
    if (target?.isConnected) target.focus();
  }
}
