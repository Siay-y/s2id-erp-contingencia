import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { FleetVehicle, VehicleStatus } from '../../../domain/entities/fleet-vehicle.entity';
import { formatInteger } from '../../formatters/number.formatters';
import { UiTone, VEHICLE_STATUS_LABELS, VEHICLE_STATUS_TONES } from '../../mappers/ui-tone.mapper';

interface VehicleRow {
  id: string;
  prefixo: string;
  modelo: string;
  icon: string;
  mode: string;
  statusLabel: string;
  statusTone: UiTone;
  location: string;
  capacity: string;
  inMission: boolean;
  inMaintenance: boolean;
}

/** Quem pode sair agora aparece primeiro; manutenção fecha a lista. */
const STATUS_ORDER: Readonly<Record<VehicleStatus, number>> = {
  DISPONÍVEL: 0,
  'EM MISSÃO': 1,
  MANUTENÇÃO: 2,
};

/**
 * Frota em linhas, no mesmo desenho da lista de abrigos. As ações devolvem o
 * veículo à frota disponível: confirmar a entrega ou liberar da manutenção.
 */
@Component({
  selector: 'app-fleet-panel',
  imports: [MatButton, MatIcon],
  templateUrl: './fleet-panel.component.html',
  styleUrl: './fleet-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FleetPanelComponent {
  readonly fleet = input.required<readonly FleetVehicle[]>();
  readonly busy = input(false);

  readonly confirmDelivery = output<string>();
  readonly releaseVehicle = output<string>();

  protected readonly rows = computed<VehicleRow[]>(() =>
    [...this.fleet()]
      .sort(
        (a, b) =>
          STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.prefixo.localeCompare(b.prefixo),
      )
      .map((vehicle) => ({
        id: vehicle.id,
        prefixo: vehicle.prefixo,
        modelo: vehicle.modelo,
        icon: vehicle.iconeMaterial,
        mode: vehicle.modal.charAt(0) + vehicle.modal.slice(1).toLowerCase(),
        statusLabel: VEHICLE_STATUS_LABELS[vehicle.status],
        statusTone: VEHICLE_STATUS_TONES[vehicle.status],
        location: vehicle.localizacaoAtual,
        capacity: `${formatInteger(vehicle.capacidadeCargaKg)} kg`,
        inMission: vehicle.status === 'EM MISSÃO',
        inMaintenance: vehicle.status === 'MANUTENÇÃO',
      })),
  );

  protected readonly summary = computed(() => {
    const available = this.fleet().filter((vehicle) => vehicle.status === 'DISPONÍVEL').length;
    return `${available} de ${this.fleet().length} prontos para sair`;
  });
}
