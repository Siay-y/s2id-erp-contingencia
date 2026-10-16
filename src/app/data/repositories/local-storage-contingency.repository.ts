import { DestroyRef, Injectable, inject } from '@angular/core';
import {
  DispatchOrder,
  DispatchOrderDraft,
  buildS2idProtocol,
  validateDispatchDraft,
} from '../../domain/entities/dispatch-order.entity';
import {
  FleetVehicle,
  startMission,
  validateVehicle,
} from '../../domain/entities/fleet-vehicle.entity';
import {
  EMERGENCY_SURGE,
  Shelter,
  ShelterCheckIn,
  ShelterOperationalData,
  applyCheckIn,
  applyEmergencySurge,
  canReach,
  receiveSupplies,
  validateShelter,
} from '../../domain/entities/shelter.entity';
import {
  INITIAL_SIMULATION_STATE,
  SimulationState,
} from '../../domain/entities/simulation-state.entity';
import { DomainError } from '../../domain/errors/domain.error';
import {
  ContingencyChangeListener,
  ContingencyRepository,
} from '../../domain/repositories/contingency.repository';
import { PrescriptiveLogisticsAiUseCase } from '../../domain/use-cases/prescriptive-logistics-ai.use-case';
import {
  SEED_OFFLINE_MODE,
  createSeedFleet,
  createSeedOrders,
  createSeedShelters,
} from '../seed/contingency.seed';
import { JsonStorage } from '../storage/json-storage';
import { CONTINGENCY_KEYS, STORAGE_KEYS } from '../storage/storage-keys';

const PROTOCOL_SEQUENCE = /-(\d+)$/;

/**
 * Implementação offline first: cada coleção vive em uma chave própria do
 * `localStorage` e é lida a cada chamada, então duas abas abertas enxergam o
 * mesmo estado. Coleção ausente ou corrompida volta ao seed sozinha.
 */
@Injectable()
export class LocalStorageContingencyRepository extends ContingencyRepository {
  private readonly storage = inject(JsonStorage);
  private readonly ai = inject(PrescriptiveLogisticsAiUseCase);
  private readonly listeners = new Set<ContingencyChangeListener>();

  constructor() {
    super();
    this.seedMissingCollections();

    const stopWatching = this.storage.watch(CONTINGENCY_KEYS, () => this.notify());
    inject(DestroyRef).onDestroy(() => {
      stopWatching();
      this.listeners.clear();
    });
  }

  getShelters(): Shelter[] {
    return this.readShelters();
  }

  getShelterById(id: string): Shelter | null {
    return this.readShelters().find((shelter) => shelter.id === id) ?? null;
  }

  updateShelter(shelter: ShelterOperationalData): Shelter {
    validateShelter(shelter);
    const shelters = this.readShelters();
    this.requireShelter(shelters, shelter.id);

    const updated = this.ai.assess({ ...toOperational(shelter), atualizadoEm: this.now() });
    this.writeShelters(replaceById(shelters, updated));
    this.notify();
    return updated;
  }

  registerCheckIn(shelterId: string, checkIn: ShelterCheckIn): Shelter {
    const shelters = this.readShelters();
    const shelter = this.requireShelter(shelters, shelterId);

    const updated = this.ai.assess(applyCheckIn(toOperational(shelter), checkIn, this.now()));
    this.writeShelters(replaceById(shelters, updated));
    this.notify();
    return updated;
  }

  getFleet(): FleetVehicle[] {
    return this.readFleet();
  }

  updateVehicle(vehicle: FleetVehicle): FleetVehicle {
    validateVehicle(vehicle);
    const fleet = this.readFleet();
    this.requireVehicle(fleet, (item) => item.id === vehicle.id, vehicle.prefixo);

    const prefixTaken = fleet.some(
      (item) => item.id !== vehicle.id && item.prefixo === vehicle.prefixo,
    );
    if (prefixTaken) {
      throw new DomainError('INVALID_VEHICLE', `O prefixo ${vehicle.prefixo} já está em uso.`);
    }

    const updated = structuredClone(vehicle);
    this.storage.write(STORAGE_KEYS.FLEET, replaceById(fleet, updated));
    this.notify();
    return updated;
  }

  getDispatchOrders(): DispatchOrder[] {
    return this.readOrders().sort((a, b) => b.dataHora.localeCompare(a.dataHora));
  }

  registerDispatchOrder(draft: DispatchOrderDraft): DispatchOrder {
    validateDispatchDraft(draft);

    const shelters = this.readShelters();
    const fleet = this.readFleet();
    const orders = this.readOrders();

    const shelter = this.requireShelter(shelters, draft.abrigoId);
    const vehicle = this.requireVehicle(
      fleet,
      (item) => item.prefixo === draft.veiculoPrefixo,
      draft.veiculoPrefixo,
    );

    if (!canReach(shelter, vehicle.modal)) {
      throw new DomainError(
        'INVALID_DISPATCH',
        `${shelter.nome} está isolado: o modal ${vehicle.modal.toLowerCase()} não alcança o abrigo.`,
      );
    }

    // Tudo é calculado antes da primeira gravação: se uma regra falhar, nada muda no disco.
    const issuedAt = new Date();
    const dispatchedVehicle = startMission(vehicle, shelter.nome);
    const suppliedShelter = this.ai.assess(
      receiveSupplies(toOperational(shelter), draft.itensDespachados, issuedAt.toISOString()),
    );

    const order: DispatchOrder = {
      id: createId(),
      protocoloS2id: buildS2idProtocol(shelter.uf, issuedAt, nextSequence(orders)),
      dataHora: issuedAt.toISOString(),
      abrigoId: shelter.id,
      abrigoNome: shelter.nome,
      veiculoPrefixo: vehicle.prefixo,
      itensDespachados: { ...draft.itensDespachados },
      tempoDecisaoMinutos: draft.tempoDecisaoMinutos,
      origem: draft.origem,
      sincronizadoNuvem: !this.isOfflineMode(),
    };

    this.storage.write(STORAGE_KEYS.ORDERS, [order, ...orders]);
    this.writeShelters(replaceById(shelters, suppliedShelter));
    this.storage.write(STORAGE_KEYS.FLEET, replaceById(fleet, dispatchedVehicle));
    this.notify();
    return order;
  }

  getSyncQueue(): DispatchOrder[] {
    return this.readOrders()
      .filter((order) => !order.sincronizadoNuvem)
      .sort((a, b) => a.dataHora.localeCompare(b.dataHora));
  }

  syncPendingOrders(): DispatchOrder[] {
    if (this.isOfflineMode()) return [];

    const orders = this.readOrders();
    const pending = orders.filter((order) => !order.sincronizadoNuvem);
    if (pending.length === 0) return [];

    this.storage.write(
      STORAGE_KEYS.ORDERS,
      orders.map((order) => ({ ...order, sincronizadoNuvem: true })),
    );
    this.notify();
    return pending.map((order) => ({ ...order, sincronizadoNuvem: true }));
  }

  isOfflineMode(): boolean {
    return this.storage.read<boolean>(STORAGE_KEYS.OFFLINE_MODE) === true;
  }

  /** Voltar a ficar online descarrega a fila, como faria o service worker ao reconectar. */
  setOfflineMode(enabled: boolean): void {
    this.storage.write(STORAGE_KEYS.OFFLINE_MODE, enabled);
    if (!enabled) this.syncPendingOrders();
    this.notify();
  }

  getSimulationState(): SimulationState {
    const state = this.storage.read<SimulationState>(STORAGE_KEYS.SIMULATION);
    return isSimulationState(state) ? state : { ...INITIAL_SIMULATION_STATE };
  }

  /**
   * Chegada em massa, agravamento do acesso viário e
   * `EMERGENCY_SURGE.horasSemReposicao` horas de consumo sem reposição.
   */
  simulateEmergencyPeak(): Shelter[] {
    const at = this.now();
    const shelters = this.readShelters().map((shelter) =>
      this.ai.assess(
        this.ai.projectStock(
          applyEmergencySurge(toOperational(shelter), at),
          EMERGENCY_SURGE.horasSemReposicao,
        ),
      ),
    );

    const state = this.getSimulationState();
    this.writeShelters(shelters);
    this.storage.write(STORAGE_KEYS.SIMULATION, {
      picosSimulados: state.picosSimulados + 1,
      ultimoPicoEm: at,
    } satisfies SimulationState);
    this.notify();
    return structuredClone(shelters);
  }

  resetToDefaults(): void {
    const now = new Date();
    this.writeShelters(this.seedShelters(now));
    this.storage.write(STORAGE_KEYS.FLEET, createSeedFleet());
    this.storage.write(STORAGE_KEYS.ORDERS, createSeedOrders(now));
    this.storage.write(STORAGE_KEYS.OFFLINE_MODE, SEED_OFFLINE_MODE);
    this.storage.write(STORAGE_KEYS.SIMULATION, { ...INITIAL_SIMULATION_STATE });
    this.notify();
  }

  subscribe(listener: ContingencyChangeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private seedMissingCollections(): void {
    const now = new Date();

    if (!Array.isArray(this.storage.read(STORAGE_KEYS.SHELTERS))) {
      this.writeShelters(this.seedShelters(now));
    }
    if (!Array.isArray(this.storage.read(STORAGE_KEYS.FLEET))) {
      this.storage.write(STORAGE_KEYS.FLEET, createSeedFleet());
    }
    if (!Array.isArray(this.storage.read(STORAGE_KEYS.ORDERS))) {
      this.storage.write(STORAGE_KEYS.ORDERS, createSeedOrders(now));
    }
    if (typeof this.storage.read(STORAGE_KEYS.OFFLINE_MODE) !== 'boolean') {
      this.storage.write(STORAGE_KEYS.OFFLINE_MODE, SEED_OFFLINE_MODE);
    }
    if (!isSimulationState(this.storage.read(STORAGE_KEYS.SIMULATION))) {
      this.storage.write(STORAGE_KEYS.SIMULATION, { ...INITIAL_SIMULATION_STATE });
    }
  }

  /** O seed guarda só dados operacionais; autonomia, risco e explicabilidade saem do motor. */
  private seedShelters(now: Date): Shelter[] {
    return createSeedShelters(now).map((shelter) => this.ai.assess(shelter));
  }

  private readShelters(): Shelter[] {
    return this.readList<Shelter>(STORAGE_KEYS.SHELTERS, () => this.seedShelters(new Date()));
  }

  private readFleet(): FleetVehicle[] {
    return this.readList<FleetVehicle>(STORAGE_KEYS.FLEET, createSeedFleet);
  }

  private readOrders(): DispatchOrder[] {
    return this.readList<DispatchOrder>(STORAGE_KEYS.ORDERS, () => createSeedOrders(new Date()));
  }

  /** Se a chave sumir no meio da sessão (limpeza manual, outra aba), o seed é regravado. */
  private readList<T>(key: (typeof CONTINGENCY_KEYS)[number], seed: () => T[]): T[] {
    const stored = this.storage.read<T[]>(key);
    if (Array.isArray(stored)) return stored;

    const fallback = seed();
    this.storage.write(key, fallback);
    return structuredClone(fallback);
  }

  private writeShelters(shelters: readonly Shelter[]): void {
    this.storage.write(STORAGE_KEYS.SHELTERS, shelters);
  }

  private requireShelter(shelters: readonly Shelter[], id: string): Shelter {
    const shelter = shelters.find((item) => item.id === id);
    if (!shelter) throw new DomainError('SHELTER_NOT_FOUND', 'Abrigo não encontrado.');
    return shelter;
  }

  private requireVehicle(
    fleet: readonly FleetVehicle[],
    match: (vehicle: FleetVehicle) => boolean,
    prefixo: string,
  ): FleetVehicle {
    const vehicle = fleet.find(match);
    if (!vehicle) {
      throw new DomainError('VEHICLE_NOT_FOUND', `Veículo ${prefixo} não encontrado na frota.`);
    }
    return vehicle;
  }

  private now(): string {
    return new Date().toISOString();
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }
}

/** Remove os campos derivados para que nada calculado volte ao motor como se fosse dado de entrada. */
function toOperational(shelter: ShelterOperationalData): ShelterOperationalData {
  return {
    id: shelter.id,
    nome: shelter.nome,
    municipio: shelter.municipio,
    uf: shelter.uf,
    baciaHidrografica: shelter.baciaHidrografica,
    acessoViario: shelter.acessoViario,
    capacidadeTotal: shelter.capacidadeTotal,
    ocupacaoAtual: shelter.ocupacaoAtual,
    gruposVulneraveis: { ...shelter.gruposVulneraveis },
    estoque: { ...shelter.estoque },
    atualizadoEm: shelter.atualizadoEm,
  };
}

function replaceById<T extends { id: string }>(items: readonly T[], updated: T): T[] {
  return items.map((item) => (item.id === updated.id ? updated : item));
}

function nextSequence(orders: readonly DispatchOrder[]): number {
  const sequences = orders.map((order) =>
    Number(PROTOCOL_SEQUENCE.exec(order.protocoloS2id)?.[1] ?? 0),
  );
  return Math.max(0, ...sequences) + 1;
}

function isSimulationState(value: unknown): value is SimulationState {
  if (typeof value !== 'object' || value === null) return false;
  const state = value as Record<string, unknown>;
  return (
    typeof state['picosSimulados'] === 'number' &&
    (state['ultimoPicoEm'] === null || typeof state['ultimoPicoEm'] === 'string')
  );
}

/** `crypto.randomUUID` só existe em contexto seguro; testar pelo IP da rede local no celular é HTTP. */
function createId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();

  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}
