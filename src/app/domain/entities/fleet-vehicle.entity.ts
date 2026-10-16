import { DomainError } from '../errors/domain.error';

export type TransportMode = 'TERRESTRE' | 'FLUVIAL' | 'AÉREO';

export type VehicleStatus = 'DISPONÍVEL' | 'EM MISSÃO' | 'MANUTENÇÃO';

/** Viatura, embarcação ou aeronave da frota de resgate e suprimentos. */
export interface FleetVehicle {
  id: string;
  prefixo: string;
  modelo: string;
  modal: TransportMode;
  /** Nome do glifo em Material Symbols. */
  iconeMaterial: string;
  status: VehicleStatus;
  localizacaoAtual: string;
  capacidadeCargaKg: number;
}

export const TRANSPORT_MODES: readonly TransportMode[] = ['TERRESTRE', 'FLUVIAL', 'AÉREO'];

export const VEHICLE_STATUSES: readonly VehicleStatus[] = ['DISPONÍVEL', 'EM MISSÃO', 'MANUTENÇÃO'];

export const TRANSPORT_MODE_ICONS: Readonly<Record<TransportMode, string>> = {
  TERRESTRE: 'local_shipping',
  FLUVIAL: 'directions_boat',
  AÉREO: 'flight',
};

export function isAvailable(vehicle: FleetVehicle): boolean {
  return vehicle.status === 'DISPONÍVEL' && vehicle.capacidadeCargaKg > 0;
}

export function validateVehicle(vehicle: FleetVehicle): void {
  const fail = (message: string): never => {
    throw new DomainError('INVALID_VEHICLE', message);
  };

  if (!vehicle.prefixo.trim()) fail('Informe o prefixo do veículo.');
  if (!vehicle.modelo.trim()) fail('Informe o modelo do veículo.');
  if (!TRANSPORT_MODES.includes(vehicle.modal)) fail('Modal de transporte desconhecido.');
  if (!VEHICLE_STATUSES.includes(vehicle.status)) fail('Situação do veículo desconhecida.');
  if (!Number.isFinite(vehicle.capacidadeCargaKg) || vehicle.capacidadeCargaKg <= 0) {
    fail('A capacidade de carga precisa ser maior que zero.');
  }
}

export function startMission(vehicle: FleetVehicle, destino: string): FleetVehicle {
  if (!isAvailable(vehicle)) {
    const reason = vehicle.status === 'EM MISSÃO' ? 'já está em missão' : 'está em manutenção';
    throw new DomainError(
      'VEHICLE_UNAVAILABLE',
      `O veículo ${vehicle.prefixo} ${reason} e não pode assumir o despacho.`,
    );
  }
  return { ...vehicle, status: 'EM MISSÃO', localizacaoAtual: `Em rota para ${destino}` };
}

export function completeMission(vehicle: FleetVehicle, localizacao: string): FleetVehicle {
  return { ...vehicle, status: 'DISPONÍVEL', localizacaoAtual: localizacao };
}
