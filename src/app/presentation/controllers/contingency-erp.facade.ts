import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ModalService } from '../../core/ui/modal/modal.service';
import { ModalDetailGroup } from '../../core/ui/modal/modal.model';
import {
  DispatchOrder,
  SupplyLoad,
  isInTransit,
  loadInTransit,
} from '../../domain/entities/dispatch-order.entity';
import { FleetVehicle, releaseFromMaintenance } from '../../domain/entities/fleet-vehicle.entity';
import {
  EMERGENCY_SURGE,
  Shelter,
  ShelterStatus,
  VulnerableGroups,
} from '../../domain/entities/shelter.entity';
import { SimulationState } from '../../domain/entities/simulation-state.entity';
import { DomainError } from '../../domain/errors/domain.error';
import { ContingencyRepository } from '../../domain/repositories/contingency.repository';
import { roundTo } from '../../domain/shared/numbers';
import {
  LogisticsPrescription,
  PrescriptiveLogisticsAiUseCase,
} from '../../domain/use-cases/prescriptive-logistics-ai.use-case';
import { Meta924Kpis, computeMeta924Kpis } from './meta-924-kpis';

/** Família usada pelo botão rápido de check-in: um idoso, duas crianças e um pet. */
export const QUICK_CHECK_IN = {
  pessoas: 4,
  vulneraveis: { idosos: 1, criancas: 2, pcd: 0, pets: 1 },
} as const satisfies { pessoas: number; vulneraveis: VulnerableGroups };

export const QUICK_CONSUMPTION_HOURS = 6;

export interface ShelterPriority {
  shelter: Shelter;
  prescription: LogisticsPrescription;
}

const SEVERITY: Readonly<Record<ShelterStatus, number>> = {
  ESTÁVEL: 0,
  ATENÇÃO: 1,
  SOBRECARGA: 2,
  'COLAPSO LOGÍSTICO': 3,
};

const SNACK_MS = 4000;
const integer = new Intl.NumberFormat('pt-BR');
const decimal = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });

/**
 * Controller da tela de contingência. Os componentes leem apenas os signals
 * daqui e chamam apenas os métodos daqui: nenhum deles conhece o repositório,
 * o motor prescritivo ou a modal.
 *
 * O estado é um espelho do repositório. Toda gravação, desta aba ou de outra,
 * dispara `subscribe`, que relê as coleções; por isso nenhum método atualiza
 * signal à mão depois de gravar.
 */
@Injectable({ providedIn: 'root' })
export class ContingencyErpFacade {
  private readonly repository = inject(ContingencyRepository);
  private readonly ai = inject(PrescriptiveLogisticsAiUseCase);
  private readonly modal = inject(ModalService);
  private readonly snackBar = inject(MatSnackBar);

  private readonly _shelters = signal<Shelter[]>([]);
  private readonly _fleet = signal<FleetVehicle[]>([]);
  private readonly _orders = signal<DispatchOrder[]>([]);
  private readonly _offline = signal(false);
  private readonly _simulation = signal<SimulationState>({ picosSimulados: 0, ultimoPicoEm: null });
  private readonly _selectedId = signal<string | null>(null);
  private readonly _busy = signal(false);

  /** Do maior para o menor risco: o abrigo que mais precisa de atenção abre a lista. */
  readonly shelters = computed(() =>
    [...this._shelters()].sort(
      (a, b) => b.riscoColapsoIA - a.riscoColapsoIA || a.nome.localeCompare(b.nome, 'pt-BR'),
    ),
  );

  /** Sem seleção, o foco vai para o abrigo de maior risco. */
  readonly selectedShelter = computed<Shelter | null>(() => {
    const shelters = this.shelters();
    const id = this._selectedId();
    return shelters.find((shelter) => shelter.id === id) ?? shelters[0] ?? null;
  });

  readonly fleet = this._fleet.asReadonly();
  readonly dispatchOrders = this._orders.asReadonly();
  readonly isOfflineMode = this._offline.asReadonly();
  readonly simulationState = this._simulation.asReadonly();
  readonly isBusy = this._busy.asReadonly();

  readonly pendingSyncCount = computed(
    () => this._orders().filter((order) => !order.sincronizadoNuvem).length,
  );

  /** Abrigos com carga despachada que ainda não teve a entrega confirmada. */
  readonly sheltersAwaitingDelivery = computed<ReadonlySet<string>>(
    () =>
      new Set(
        this._orders()
          .filter(isInTransit)
          .map((order) => order.abrigoId),
      ),
  );

  readonly selectedInTransit = computed<SupplyLoad | null>(() => {
    const shelter = this.selectedShelter();
    return shelter ? loadInTransit(this._orders(), shelter.id) : null;
  });

  readonly currentPrescription = computed<LogisticsPrescription | null>(() => {
    const shelter = this.selectedShelter();
    return shelter ? this.prescribeFor(shelter) : null;
  });

  /**
   * O que pede ação agora: o abrigo de maior risco que não está estável e
   * ainda precisa de envio. Um abrigo cuja carga já está a caminho sai da
   * frente e dá lugar ao próximo. `null` quando a operação está sob controle.
   */
  readonly priority = computed<ShelterPriority | null>(() => {
    for (const shelter of this.shelters()) {
      if (shelter.status === 'ESTÁVEL') continue;
      const prescription = this.prescribeFor(shelter);
      if (prescription.necessitaEnvio) return { shelter, prescription };
    }
    return null;
  });

  readonly kpis = computed<Meta924Kpis>(() =>
    computeMeta924Kpis(this._shelters(), this._fleet(), this._orders()),
  );

  constructor() {
    this.refresh();
    const unsubscribe = this.repository.subscribe(() => this.refresh());
    inject(DestroyRef).onDestroy(unsubscribe);
  }

  selectShelter(id: string): void {
    this._selectedId.set(id);
  }

  toggleOfflineMode(): void {
    const goingOffline = !this._offline();
    const pending = this.pendingSyncCount();

    this.run(() => this.repository.setOfflineMode(goingOffline));

    if (goingOffline) {
      this.notify('Modo offline ativo. Novas ordens entram na fila de sincronização.');
    } else if (pending > 0) {
      this.notify(
        `Conexão restabelecida. ${plural(pending, 'ordem sincronizada', 'ordens sincronizadas')} com o S2iD.`,
      );
    } else {
      this.notify('Conexão restabelecida. Nenhuma ordem pendente.');
    }
  }

  registerCheckIn(
    shelterId: string,
    addPessoas: number,
    addVulneraveis: Partial<VulnerableGroups> = {},
  ): void {
    const before = this.findShelter(shelterId);

    const updated = this.run(() =>
      this.repository.registerCheckIn(shelterId, {
        pessoas: addPessoas,
        idosos: addVulneraveis.idosos ?? 0,
        criancas: addVulneraveis.criancas ?? 0,
        pcd: addVulneraveis.pcd ?? 0,
        pets: addVulneraveis.pets ?? 0,
      }),
    );
    if (!updated) return;

    const worsened = before && SEVERITY[updated.status] > SEVERITY[before.status];
    this.notify(
      `${plural(addPessoas, 'pessoa acolhida', 'pessoas acolhidas')} em ${updated.nome}.` +
        (worsened ? ` Status agora: ${updated.status}.` : ''),
    );
  }

  /**
   * Registra a entrega informada pela equipe em campo. O app não simula o
   * deslocamento, então o fim da missão é sempre uma confirmação do operador.
   * Só então a carga entra no estoque do abrigo e o veículo volta à frota, no
   * município do abrigo, que é de onde parte para o próximo despacho.
   */
  async confirmDelivery(vehicleId: string): Promise<void> {
    const vehicle = this._fleet().find((item) => item.id === vehicleId);
    if (!vehicle || this._busy()) return;

    const order = this._orders().find(
      (item) => item.veiculoPrefixo === vehicle.prefixo && isInTransit(item),
    );
    const shelter = order ? this.findShelter(order.abrigoId) : null;
    if (!order || !shelter) {
      this.showError(`O veículo ${vehicle.prefixo} não tem entrega pendente.`);
      return;
    }

    this._busy.set(true);
    try {
      const confirmed = await this.modal.confirm({
        variant: 'info',
        eyebrow: 'Fim de missão',
        icon: vehicle.iconeMaterial,
        title: `A carga do ${vehicle.prefixo} chegou?`,
        message: `Confirme só depois que a equipe avisar, por rádio ou telefone, que entregou a carga em ${shelter.nome}. O estoque do abrigo recebe os itens e o veículo volta à frota em ${shelter.municipio}/${shelter.uf}.`,
        details: [this.loadGroup('Carga a entregar', order.itensDespachados)],
        confirmLabel: 'Confirmar entrega',
        confirmIcon: 'task_alt',
        cancelLabel: 'Ainda em rota',
      });
      if (!confirmed) return;
    } finally {
      this._busy.set(false);
    }

    const delivered = this.run(() => this.repository.confirmDelivery(order.id));
    if (!delivered) return;

    const updated = this.findShelter(shelter.id);
    this.notify(
      `Entrega confirmada em ${shelter.nome}.` +
        (updated ? ` Risco agora em ${updated.riscoColapsoIA}%.` : ''),
    );
  }

  releaseVehicleFromMaintenance(vehicleId: string): void {
    const vehicle = this._fleet().find((item) => item.id === vehicleId);
    if (!vehicle) return;

    const updated = this.run(() => this.repository.updateVehicle(releaseFromMaintenance(vehicle)));
    if (!updated) return;

    this.notify(`${updated.prefixo} saiu da manutenção e está disponível.`);
  }

  /** Avança o relógio do abrigo: `hours` horas de consumo sem reposição. */
  consumeStock(shelterId: string, hours: number = QUICK_CONSUMPTION_HOURS): void {
    const shelter = this.findShelter(shelterId);
    if (!shelter) return;

    const updated = this.run(() =>
      this.repository.updateShelter(this.ai.projectStock(shelter, hours)),
    );
    if (!updated) return;

    this.notify(
      `${hours} h de consumo em ${updated.nome}. Água para ${decimal.format(updated.autonomiaHoras.agua)} h.`,
    );
  }

  /**
   * Abre o manifesto logístico do abrigo informado (ou do selecionado) e, se
   * o operador confirmar, registra o despacho. O tempo entre abrir o
   * manifesto e confirmar vira o `tempoDecisaoMinutos` da ordem.
   */
  async executeAiPrescription(shelterId?: string): Promise<DispatchOrder | null> {
    if (shelterId) this.selectShelter(shelterId);
    const shelter = this.selectedShelter();
    const prescription = this.currentPrescription();
    if (!shelter || !prescription || this._busy()) return null;

    if (!prescription.necessitaEnvio) {
      void this.modal.alert({
        variant: 'success',
        eyebrow: 'IA prescritiva',
        title: `${shelter.nome} não precisa de novo envio`,
        message: prescription.justificativas[0],
      });
      return null;
    }

    const vehicle = prescription.veiculo;
    if (!vehicle) {
      void this.modal.alert({
        variant: 'danger',
        eyebrow: 'IA prescritiva',
        title: 'Nenhum veículo alcança o abrigo',
        message: `A carga de ${decimal.format(prescription.cargaTotalKg)} kg está calculada, mas não há veículo disponível compatível com o acesso ${shelter.acessoViario.toLowerCase()}.`,
        details: [this.cargoGroup(prescription)],
        bulletsTitle: 'Por que a IA recomenda',
        bullets: prescription.justificativas,
        size: 'lg',
      });
      return null;
    }

    this._busy.set(true);
    const openedAt = Date.now();

    try {
      const confirmed = await this.modal.confirm({
        variant: shelter.status === 'COLAPSO LOGÍSTICO' ? 'danger' : 'warning',
        eyebrow: 'Manifesto logístico',
        icon: 'local_shipping',
        title: `Despachar suprimentos para ${shelter.nome}`,
        message: `Prescrição para ${prescription.horizonteHoras} h de autonomia. Risco atual de ${shelter.riscoColapsoIA}% (${shelter.status.toLowerCase()}).`,
        details: [this.cargoGroup(prescription), this.transportGroup(prescription, vehicle)],
        bulletsTitle: 'Por que a IA recomenda',
        bullets: prescription.justificativas,
        confirmLabel: 'Confirmar despacho',
        confirmIcon: 'send',
        cancelLabel: 'Revisar depois',
        size: 'lg',
      });
      if (!confirmed) return null;

      const order = this.run(() =>
        this.repository.registerDispatchOrder({
          abrigoId: shelter.id,
          veiculoPrefixo: vehicle.prefixo,
          itensDespachados: prescription.itens,
          tempoDecisaoMinutos: roundTo((Date.now() - openedAt) / 60_000, 1),
          origem: 'IA_PRESCRITIVA',
        }),
      );
      if (!order) return null;

      void this.modal.alert({
        variant: 'success',
        eyebrow: order.sincronizadoNuvem ? 'Sincronizado com o S2iD' : 'Na fila offline',
        title: 'Ordem de despacho registrada',
        message:
          `${order.veiculoPrefixo} está em rota para ${order.abrigoNome}. ` +
          'O estoque do abrigo sobe quando você confirmar a entrega na lista da frota.' +
          (order.sincronizadoNuvem ? '' : ' A ordem sobe ao S2iD quando a conexão voltar.'),
        details: [
          {
            title: 'Protocolo',
            icon: 'fact_check',
            items: [
              { label: 'Número', value: order.protocoloS2id, emphasis: true },
              { label: 'Tempo de decisão', value: formatDecisionTime(order.tempoDecisaoMinutos) },
              { label: 'Entrega', value: 'Aguardando confirmação' },
            ],
          },
        ],
      });
      return order;
    } finally {
      this._busy.set(false);
    }
  }

  async simulateMassInfluxCrisis(): Promise<void> {
    if (this._busy()) return;
    this._busy.set(true);

    try {
      const confirmed = await this.modal.confirm({
        variant: 'warning',
        eyebrow: 'Simulador de cenários',
        icon: 'warning_amber',
        title: 'Simular pico de desabrigados?',
        message:
          'Todos os abrigos recebem o mesmo choque, e o motor prescritivo recalcula o risco de cada um.',
        bulletsTitle: 'O que acontece',
        bullets: [
          `Chegada de ${Math.round(EMERGENCY_SURGE.chegadaPctCapacidade * 100)}% da capacidade de cada abrigo, com idosos, crianças, PcD e pets.`,
          'O acesso viário piora um nível: livre vira restrito e restrito vira isolado.',
          `${EMERGENCY_SURGE.horasSemReposicao} h de consumo sem reposição de estoque.`,
        ],
        confirmLabel: 'Simular pico',
        confirmIcon: 'warning_amber',
      });
      if (!confirmed) return;

      const before = this._shelters();
      const after = this.run(() => this.repository.simulateEmergencyPeak());
      if (!after) return;

      const arrivals =
        after.reduce((total, s) => total + s.ocupacaoAtual, 0) -
        before.reduce((total, s) => total + s.ocupacaoAtual, 0);
      const collapsed = after.filter((s) => s.status === 'COLAPSO LOGÍSTICO').length;

      void this.modal.alert({
        variant: collapsed > 0 ? 'danger' : 'warning',
        eyebrow: `Pico simulado nº ${this._simulation().picosSimulados}`,
        title: `${integer.format(arrivals)} novos desabrigados`,
        message: 'Revise os abrigos em vermelho e execute as prescrições da IA por ordem de risco.',
        details: [
          {
            title: 'Situação dos abrigos',
            icon: 'night_shelter',
            items: after
              .slice()
              .sort((a, b) => b.riscoColapsoIA - a.riscoColapsoIA)
              .map((s) => ({
                label: s.nome,
                value: `${s.riscoColapsoIA}% · ${s.status}`,
                emphasis: s.status === 'COLAPSO LOGÍSTICO',
              })),
          },
        ],
        size: 'lg',
      });
    } finally {
      this._busy.set(false);
    }
  }

  async resetAll(): Promise<void> {
    if (this._busy()) return;
    this._busy.set(true);

    try {
      const confirmed = await this.modal.confirm({
        variant: 'danger',
        eyebrow: 'Restaurar dados',
        icon: 'restart_alt',
        title: 'Voltar aos dados padrão?',
        message:
          'Abrigos, frota, ordens de despacho, fila offline e simulações voltam ao estado inicial. Esta ação não pode ser desfeita.',
        confirmLabel: 'Restaurar',
        confirmIcon: 'restart_alt',
        destructive: true,
      });
      if (!confirmed) return;

      this.run(() => this.repository.resetToDefaults());
      this._selectedId.set(null);
      this.notify('Dados padrão restaurados.');
    } finally {
      this._busy.set(false);
    }
  }

  private refresh(): void {
    this._shelters.set(this.repository.getShelters());
    this._fleet.set(this.repository.getFleet());
    this._orders.set(this.repository.getDispatchOrders());
    this._offline.set(this.repository.isOfflineMode());
    this._simulation.set(this.repository.getSimulationState());
  }

  private findShelter(id: string): Shelter | null {
    return this._shelters().find((shelter) => shelter.id === id) ?? null;
  }

  /** Regra de negócio violada vira modal; qualquer outro erro sobe para o `ErrorHandler`. */
  private run<T>(operation: () => T): T | null {
    try {
      return operation();
    } catch (error) {
      if (!(error instanceof DomainError)) throw error;
      this.showError(error.message);
      return null;
    }
  }

  private showError(message: string): void {
    void this.modal.alert({
      variant: 'danger',
      eyebrow: 'Operação não realizada',
      title: 'Não foi possível concluir',
      message,
    });
  }

  private prescribeFor(shelter: Shelter): LogisticsPrescription {
    return this.ai.prescribe(shelter, this._fleet(), loadInTransit(this._orders(), shelter.id));
  }

  private notify(message: string): void {
    this.snackBar.open(message, 'OK', { duration: SNACK_MS });
  }

  private cargoGroup(prescription: LogisticsPrescription): ModalDetailGroup {
    const group = this.loadGroup('Carga', prescription.itens);
    return {
      ...group,
      items: [
        ...group.items,
        {
          label: 'Peso total',
          icon: 'scale',
          value: `${decimal.format(prescription.cargaTotalKg)} kg`,
          emphasis: true,
        },
      ],
    };
  }

  private loadGroup(title: string, load: SupplyLoad): ModalDetailGroup {
    return {
      title,
      icon: 'inventory_2',
      items: [
        { label: 'Água', icon: 'water_drop', value: `${integer.format(load.aguaLitros)} L` },
        { label: 'Refeições', icon: 'restaurant', value: integer.format(load.refeicoes) },
        {
          label: 'Kits médicos',
          icon: 'medical_services',
          value: integer.format(load.kitsMedicos),
        },
      ],
    };
  }

  private transportGroup(
    prescription: LogisticsPrescription,
    vehicle: FleetVehicle,
  ): ModalDetailGroup {
    return {
      title: 'Transporte',
      icon: 'route',
      items: [
        {
          label: 'Veículo',
          icon: vehicle.iconeMaterial,
          value: `${vehicle.prefixo} · ${vehicle.modelo}`,
        },
        { label: 'Modal', value: capitalize(vehicle.modal.toLowerCase()) },
        { label: 'Saída de', value: vehicle.localizacaoAtual },
        {
          label: 'Viagens',
          value: plural(prescription.viagensNecessarias, 'viagem', 'viagens'),
          emphasis: prescription.viagensNecessarias > 1,
        },
      ],
    };
  }
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function formatDecisionTime(minutes: number): string {
  return minutes < 1 ? 'menos de 1 min' : `${decimal.format(minutes)} min`;
}

function plural(count: number, singular: string, pluralForm: string): string {
  return `${integer.format(count)} ${count === 1 ? singular : pluralForm}`;
}
