import { DispatchOrder, DispatchOrderDraft } from '../entities/dispatch-order.entity';
import { FleetVehicle } from '../entities/fleet-vehicle.entity';
import { Shelter, ShelterCheckIn, ShelterOperationalData } from '../entities/shelter.entity';
import { SimulationState } from '../entities/simulation-state.entity';

export type ContingencyChangeListener = () => void;

/**
 * Contrato de persistência do plano de contingência. É uma classe abstrata,
 * e não uma interface, para servir de token de injeção: a apresentação
 * depende desta abstração e o `app.config.ts` decide a implementação.
 *
 * Todas as operações são síncronas porque o armazenamento é local. Uma
 * implementação remota futura troca esta classe sem tocar no domínio.
 * Leituras devolvem cópias; alterar o retorno não altera o que está gravado.
 */
export abstract class ContingencyRepository {
  abstract getShelters(): Shelter[];

  abstract getShelterById(id: string): Shelter | null;

  /** Grava os dados operacionais e devolve o abrigo já reavaliado pelo motor prescritivo. */
  abstract updateShelter(shelter: ShelterOperationalData): Shelter;

  abstract registerCheckIn(shelterId: string, checkIn: ShelterCheckIn): Shelter;

  abstract getFleet(): FleetVehicle[];

  abstract updateVehicle(vehicle: FleetVehicle): FleetVehicle;

  /** Da mais recente para a mais antiga. */
  abstract getDispatchOrders(): DispatchOrder[];

  /**
   * Registra a ordem como uma unidade: grava a ordem, entrega os suprimentos
   * ao abrigo e coloca o veículo em missão. Se qualquer regra falhar, nada é gravado.
   */
  abstract registerDispatchOrder(draft: DispatchOrderDraft): DispatchOrder;

  /** Ordens ainda não enviadas ao S2iD, da mais antiga para a mais recente. */
  abstract getSyncQueue(): DispatchOrder[];

  /** Descarrega a fila. Em modo offline não faz nada e devolve lista vazia. */
  abstract syncPendingOrders(): DispatchOrder[];

  abstract isOfflineMode(): boolean;

  abstract setOfflineMode(enabled: boolean): void;

  abstract getSimulationState(): SimulationState;

  /** Aplica um pico de emergência a todos os abrigos e devolve o resultado reavaliado. */
  abstract simulateEmergencyPeak(): Shelter[];

  abstract resetToDefaults(): void;

  /**
   * Avisa a cada gravação, inclusive as feitas em outra aba do mesmo
   * navegador. Devolve a função que cancela a inscrição.
   */
  abstract subscribe(listener: ContingencyChangeListener): () => void;
}
