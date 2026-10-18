import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatMenu, MatMenuItem, MatMenuTrigger } from '@angular/material/menu';
import { MatTooltip } from '@angular/material/tooltip';

/** Topbar. Mostra o estado da conexão e emite intenções; quem decide é o facade. */
@Component({
  selector: 'app-erp-header',
  imports: [MatButton, MatIconButton, MatIcon, MatMenu, MatMenuItem, MatMenuTrigger, MatTooltip],
  templateUrl: './erp-header.component.html',
  styleUrl: './erp-header.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ErpHeaderComponent {
  readonly offlineMode = input.required<boolean>();
  readonly pendingSyncCount = input.required<number>();
  readonly busy = input(false);

  readonly toggleOffline = output<void>();
  readonly simulateCrisis = output<void>();
  readonly resetData = output<void>();

  protected readonly syncLabel = computed(() => {
    const pending = this.pendingSyncCount();
    const state = this.offlineMode() ? 'Offline' : 'Online';
    return pending > 0 ? `${state} · ${pending} na fila` : state;
  });

  protected readonly syncHint = computed(() =>
    this.offlineMode()
      ? 'Novas ordens ficam na fila até a conexão voltar. Clique para reconectar.'
      : 'Ordens sobem ao S2iD na hora. Clique para simular a perda de conexão.',
  );
}
