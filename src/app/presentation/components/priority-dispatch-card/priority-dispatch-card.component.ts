import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { Shelter } from '../../../domain/entities/shelter.entity';
import { LogisticsPrescription } from '../../../domain/use-cases/prescriptive-logistics-ai.use-case';
import { formatInteger } from '../../formatters/number.formatters';
import { describeRecommendation, describeShortage } from '../../formatters/prescription.formatters';
import {
  ROAD_ACCESS_LABELS,
  SHELTER_STATUS_LABELS,
  SHELTER_STATUS_TONES,
} from '../../mappers/ui-tone.mapper';

/**
 * A única chamada para ação da tela: o abrigo de maior risco e o que a IA
 * recomenda fazer, numa frase. O operador decide sem abrir nada.
 */
@Component({
  selector: 'app-priority-dispatch-card',
  imports: [MatButton, MatIcon],
  templateUrl: './priority-dispatch-card.component.html',
  styleUrl: './priority-dispatch-card.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PriorityDispatchCardComponent {
  readonly shelter = input.required<Shelter>();
  readonly prescription = input.required<LogisticsPrescription>();
  readonly busy = input(false);

  readonly dispatch = output<void>();
  readonly openShelter = output<void>();

  protected readonly tone = computed(() => SHELTER_STATUS_TONES[this.shelter().status]);
  protected readonly statusLabel = computed(() => SHELTER_STATUS_LABELS[this.shelter().status]);

  protected readonly context = computed(() => {
    const s = this.shelter();
    return [
      `${s.municipio}/${s.uf}`,
      ROAD_ACCESS_LABELS[s.acessoViario].toLowerCase(),
      `${formatInteger(s.ocupacaoAtual)} de ${formatInteger(s.capacidadeTotal)} vagas ocupadas`,
    ].join(' · ');
  });

  protected readonly problem = computed(() => describeShortage(this.shelter()));
  protected readonly recommendation = computed(() => describeRecommendation(this.prescription()));
}
