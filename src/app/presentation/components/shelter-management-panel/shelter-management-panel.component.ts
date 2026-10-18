import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { MatIcon } from '@angular/material/icon';
import { Shelter, occupancyRate } from '../../../domain/entities/shelter.entity';
import { formatHours } from '../../formatters/number.formatters';
import {
  ROAD_ACCESS_LABELS,
  SHELTER_STATUS_LABELS,
  SHELTER_STATUS_TONES,
  SUPPLY_LABELS,
  UiTone,
  autonomyTone,
  scarcestSupply,
} from '../../mappers/ui-tone.mapper';

interface ShelterRow {
  id: string;
  nome: string;
  place: string;
  statusLabel: string;
  /** Status e, quando houver, o aviso de carga a caminho, para a linha do celular. */
  statusMeta: string;
  statusTone: UiTone;
  occupancyPct: number;
  occupancyLabel: string;
  occupancyTone: UiTone;
  autonomy: string;
  autonomyItem: string;
  autonomyTone: UiTone;
  risk: number;
  ariaLabel: string;
}

/**
 * Lista de abrigos em linhas, do maior para o menor risco. Cada linha abre o
 * abrigo; nada aqui decide, só apresenta e avisa a seleção.
 */
@Component({
  selector: 'app-shelter-management-panel',
  imports: [MatIcon],
  templateUrl: './shelter-management-panel.component.html',
  styleUrl: './shelter-management-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ShelterManagementPanelComponent {
  readonly shelters = input.required<readonly Shelter[]>();
  readonly selectedId = input<string | null>(null);
  readonly awaitingDelivery = input<ReadonlySet<string>>(new Set());

  readonly selectShelter = output<string>();

  protected readonly rows = computed<ShelterRow[]>(() =>
    this.shelters().map((shelter) => {
      const rate = occupancyRate(shelter);
      const scarcest = scarcestSupply(shelter);
      const statusLabel = SHELTER_STATUS_LABELS[shelter.status];
      const autonomy = formatHours(scarcest.hours);
      const occupancyPct = Math.round(rate * 100);
      const enRoute = this.awaitingDelivery().has(shelter.id) ? ' · Carga a caminho' : '';

      return {
        id: shelter.id,
        nome: shelter.nome,
        place: `${shelter.municipio}/${shelter.uf} · ${ROAD_ACCESS_LABELS[shelter.acessoViario]}${enRoute}`,
        statusLabel,
        statusMeta: `${statusLabel}${enRoute.toLowerCase()}`,
        statusTone: SHELTER_STATUS_TONES[shelter.status],
        occupancyPct,
        occupancyLabel: `${occupancyPct}%`,
        occupancyTone: rate > 1 ? 'critical' : rate >= 0.9 ? 'warning' : 'neutral',
        autonomy,
        autonomyItem: SUPPLY_LABELS[scarcest.key].toLowerCase(),
        autonomyTone: autonomyTone(scarcest.hours),
        risk: shelter.riscoColapsoIA,
        ariaLabel: `${shelter.nome}, ${statusLabel}, risco ${shelter.riscoColapsoIA}%, ${occupancyPct}% ocupado, ${SUPPLY_LABELS[scarcest.key].toLowerCase()} para ${autonomy}`,
      };
    }),
  );
}
