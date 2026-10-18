import {
  DispatchOrder,
  EMPTY_SUPPLY_LOAD,
  SupplyLoad,
  isEmptyLoad,
  loadInTransit,
  loadWeightKg,
} from '../entities/dispatch-order.entity';
import { FleetVehicle, isAvailable } from '../entities/fleet-vehicle.entity';
import {
  AiExplainability,
  AutonomyHours,
  ExplainabilityFactor,
  REACHABLE_MODES,
  RoadAccess,
  Shelter,
  ShelterOperationalData,
  ShelterStatus,
  occupancyRate,
} from '../entities/shelter.entity';
import { ceilSafe, ceilToMultiple, clamp, roundTo } from '../shared/numbers';

/** Consumo por habitante e por dia. Água segue o mínimo de 15 L do Projeto Esfera. */
export const DAILY_CONSUMPTION = {
  aguaLitrosPorPessoa: 15,
  aguaLitrosPorPet: 1.5,
  refeicoesPorPessoa: 3,
  kitsMedicosPorPessoa: 0.02,
  kitsMedicosPorIdoso: 0.08,
  kitsMedicosPorCrianca: 0.04,
  kitsMedicosPorPcd: 0.06,
} as const;

/** Janela de resposta inicial: a prescrição mira 72 h de autonomia em todos os itens. */
export const AUTONOMY_TARGET_HOURS = 72;

/** Abaixo disto o abrigo está a uma troca de turno de ficar sem o item. */
export const AUTONOMY_CRITICAL_HOURS = 12;

/** Teto exibido quando não há consumo; evita "Infinity" na interface. */
export const AUTONOMY_CEILING_HOURS = 720;

/** Fração de vulneráveis na ocupação a partir da qual o fator satura em 1. */
export const VULNERABILITY_SATURATION = 0.6;

/** Um pet pesa um quarto de uma pessoa vulnerável no índice. */
export const PET_VULNERABILITY_WEIGHT = 0.25;

/** Água é despachada em galões fechados. */
export const WATER_PACKAGE_LITERS = 20;

/** Importância relativa de cada fator. Soma 1. */
export const RISK_WEIGHTS: Readonly<Record<ExplainabilityFactor, number>> = {
  taxaOcupacao: 0.3,
  burnRateSuprimentos: 0.35,
  indiceVulnerabilidade: 0.2,
  isolamentoViario: 0.15,
};

/**
 * Pisos de risco para situações que a média ponderada diluiria: um abrigo
 * acima da capacidade ou a poucas horas de zerar um item não pode sair
 * classificado como estável só porque os outros fatores estão bons.
 */
export const RISK_FLOORS = {
  acimaDaCapacidade: 60,
  autonomiaCritica: 80,
} as const;

/** Do status mais grave para o mais leve; o primeiro limite atingido vence. */
const STATUS_BANDS: readonly { min: number; status: ShelterStatus }[] = [
  { min: 80, status: 'COLAPSO LOGÍSTICO' },
  { min: 60, status: 'SOBRECARGA' },
  { min: 35, status: 'ATENÇÃO' },
  { min: 0, status: 'ESTÁVEL' },
];

const FACTORS: readonly ExplainabilityFactor[] = [
  'taxaOcupacao',
  'burnRateSuprimentos',
  'indiceVulnerabilidade',
  'isolamentoViario',
];

const ROAD_ISOLATION_FACTOR: Readonly<Record<RoadAccess, number>> = {
  LIVRE: 0,
  RESTRITO: 0.5,
  ISOLADO: 1,
};

const AUTONOMY_LABELS: Readonly<Record<keyof AutonomyHours, string>> = {
  agua: 'água',
  alimentos: 'alimentos',
  medicamentos: 'medicamentos',
};

const numberFormat = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });

/** Consumo por hora, nas mesmas unidades de `SupplyLoad`. */
export type HourlyConsumption = SupplyLoad;

export interface LogisticsPrescription {
  abrigoId: string;
  abrigoNome: string;
  riscoColapsoIA: number;
  status: ShelterStatus;
  necessitaEnvio: boolean;
  itens: SupplyLoad;
  /** Carga já despachada que ainda não chegou; foi descontada de `itens`. */
  emTransito: SupplyLoad;
  cargaTotalKg: number;
  /** `null` quando não há envio ou quando nenhum veículo disponível alcança o abrigo. */
  veiculo: FleetVehicle | null;
  viagensNecessarias: number;
  horizonteHoras: number;
  justificativas: string[];
}

/**
 * Motor prescritivo de alocação logística. Não depende de Angular nem de
 * armazenamento: recebe entidades, devolve entidades. Toda a matemática é
 * determinística, então o mesmo cenário sempre produz a mesma prescrição e
 * cada número pode ser auditado pelos pesos de explicabilidade.
 */
export class PrescriptiveLogisticsAiUseCase {
  /**
   * Avalia todos os abrigos e prescreve em ordem de risco, sem prometer o
   * mesmo veículo duas vezes e descontando o que as ordens em trânsito já levam.
   */
  execute(
    shelters: readonly ShelterOperationalData[],
    fleet: readonly FleetVehicle[],
    orders: readonly DispatchOrder[] = [],
  ): LogisticsPrescription[] {
    const reserved = new Set<string>();

    return shelters
      .map((shelter) => this.assess(shelter))
      .sort((a, b) => b.riscoColapsoIA - a.riscoColapsoIA || a.nome.localeCompare(b.nome, 'pt-BR'))
      .map((shelter) => {
        const prescription = this.prescribe(
          shelter,
          fleet.filter((vehicle) => !reserved.has(vehicle.id)),
          loadInTransit(orders, shelter.id),
        );
        if (prescription.veiculo) reserved.add(prescription.veiculo.id);
        return prescription;
      });
  }

  hourlyConsumption(shelter: ShelterOperationalData): HourlyConsumption {
    const { idosos, criancas, pcd, pets } = shelter.gruposVulneraveis;
    const people = shelter.ocupacaoAtual;
    const c = DAILY_CONSUMPTION;

    return {
      aguaLitros: (people * c.aguaLitrosPorPessoa + pets * c.aguaLitrosPorPet) / 24,
      refeicoes: (people * c.refeicoesPorPessoa) / 24,
      kitsMedicos:
        (people * c.kitsMedicosPorPessoa +
          idosos * c.kitsMedicosPorIdoso +
          criancas * c.kitsMedicosPorCrianca +
          pcd * c.kitsMedicosPorPcd) /
        24,
    };
  }

  /** Recalcula autonomia, risco, status e explicabilidade a partir dos dados operacionais. */
  assess(shelter: ShelterOperationalData): Shelter {
    const autonomiaHoras = this.autonomy(shelter);
    const factors = this.riskFactors(shelter, autonomiaHoras);
    const contributions = mapFactors((factor) => RISK_WEIGHTS[factor] * factors[factor]);
    const riscoColapsoIA = this.risk(shelter, autonomiaHoras, contributions);

    return {
      ...shelter,
      autonomiaHoras,
      riscoColapsoIA,
      status: statusFor(riscoColapsoIA),
      aiExplainability: toPercentages(contributions),
    };
  }

  /** Projeta o estoque depois de `hours` horas de consumo sem reposição. */
  projectStock(shelter: ShelterOperationalData, hours: number): ShelterOperationalData {
    const perHour = this.hourlyConsumption(shelter);
    const stock = shelter.estoque;

    return {
      ...shelter,
      estoque: {
        aguaLitros: Math.max(0, Math.round(stock.aguaLitros - perHour.aguaLitros * hours)),
        refeicoesUnidades: Math.max(
          0,
          Math.round(stock.refeicoesUnidades - perHour.refeicoes * hours),
        ),
        kitsMedicos: Math.max(0, Math.round(stock.kitsMedicos - perHour.kitsMedicos * hours)),
      },
    };
  }

  /**
   * Quanto enviar para fechar `AUTONOMY_TARGET_HOURS` em cada item, e com qual
   * veículo. A carga em trânsito conta como estoque futuro: sem isso, a IA
   * mandaria de novo o que já está a caminho.
   */
  prescribe(
    shelter: Shelter,
    fleet: readonly FleetVehicle[],
    emTransito: SupplyLoad = EMPTY_SUPPLY_LOAD,
  ): LogisticsPrescription {
    const perHour = this.hourlyConsumption(shelter);
    const stock = shelter.estoque;

    const itens: SupplyLoad = {
      aguaLitros: ceilToMultiple(
        deficit(perHour.aguaLitros, stock.aguaLitros + emTransito.aguaLitros),
        WATER_PACKAGE_LITERS,
      ),
      refeicoes: ceilSafe(
        deficit(perHour.refeicoes, stock.refeicoesUnidades + emTransito.refeicoes),
      ),
      kitsMedicos: ceilSafe(
        deficit(perHour.kitsMedicos, stock.kitsMedicos + emTransito.kitsMedicos),
      ),
    };

    const necessitaEnvio = !isEmptyLoad(itens);
    const cargaTotalKg = loadWeightKg(itens);
    const veiculo = necessitaEnvio ? this.pickVehicle(shelter, fleet, cargaTotalKg) : null;
    const viagensNecessarias = veiculo ? tripsFor(cargaTotalKg, veiculo) : 0;

    return {
      abrigoId: shelter.id,
      abrigoNome: shelter.nome,
      riscoColapsoIA: shelter.riscoColapsoIA,
      status: shelter.status,
      necessitaEnvio,
      itens,
      emTransito: { ...emTransito },
      cargaTotalKg,
      veiculo,
      viagensNecessarias,
      horizonteHoras: AUTONOMY_TARGET_HOURS,
      justificativas: this.explain(
        shelter,
        necessitaEnvio,
        emTransito,
        cargaTotalKg,
        veiculo,
        viagensNecessarias,
      ),
    };
  }

  private autonomy(shelter: ShelterOperationalData): AutonomyHours {
    const perHour = this.hourlyConsumption(shelter);
    const stock = shelter.estoque;

    return {
      agua: hoursOf(stock.aguaLitros, perHour.aguaLitros),
      alimentos: hoursOf(stock.refeicoesUnidades, perHour.refeicoes),
      medicamentos: hoursOf(stock.kitsMedicos, perHour.kitsMedicos),
    };
  }

  /** Cada fator normalizado entre 0 (sem pressão) e 1 (pressão máxima). */
  private riskFactors(
    shelter: ShelterOperationalData,
    autonomy: AutonomyHours,
  ): Record<ExplainabilityFactor, number> {
    const { idosos, criancas, pcd, pets } = shelter.gruposVulneraveis;
    const people = shelter.ocupacaoAtual;
    const vulnerableShare =
      people > 0 ? (idosos + criancas + pcd + pets * PET_VULNERABILITY_WEIGHT) / people : 0;

    return {
      taxaOcupacao: clamp(occupancyRate(shelter), 0, 1),
      burnRateSuprimentos: clamp(1 - minAutonomy(autonomy) / AUTONOMY_TARGET_HOURS, 0, 1),
      indiceVulnerabilidade: clamp(vulnerableShare / VULNERABILITY_SATURATION, 0, 1),
      isolamentoViario: ROAD_ISOLATION_FACTOR[shelter.acessoViario],
    };
  }

  private risk(
    shelter: ShelterOperationalData,
    autonomy: AutonomyHours,
    contributions: Record<ExplainabilityFactor, number>,
  ): number {
    let risk = Math.round(sum(FACTORS.map((factor) => contributions[factor])) * 100);

    if (shelter.ocupacaoAtual > shelter.capacidadeTotal) {
      risk = Math.max(risk, RISK_FLOORS.acimaDaCapacidade);
    }
    if (shelter.ocupacaoAtual > 0 && minAutonomy(autonomy) <= AUTONOMY_CRITICAL_HOURS) {
      risk = Math.max(risk, RISK_FLOORS.autonomiaCritica);
    }
    return clamp(risk, 0, 100);
  }

  /**
   * Ordem de escolha: menos viagens, veículo já no município do abrigo,
   * modal mais barato e, por fim, a menor capacidade que resolve, para não
   * prender um caminhão grande numa entrega pequena.
   */
  private pickVehicle(
    shelter: Shelter,
    fleet: readonly FleetVehicle[],
    cargaTotalKg: number,
  ): FleetVehicle | null {
    const modes = REACHABLE_MODES[shelter.acessoViario];
    const municipio = normalize(shelter.municipio);

    const ranked = fleet
      .filter((vehicle) => isAvailable(vehicle) && modes.includes(vehicle.modal))
      .map((vehicle) => ({
        vehicle,
        trips: tripsFor(cargaTotalKg, vehicle),
        nearby: normalize(vehicle.localizacaoAtual).includes(municipio) ? 0 : 1,
        modeRank: modes.indexOf(vehicle.modal),
      }))
      .sort(
        (a, b) =>
          a.trips - b.trips ||
          a.nearby - b.nearby ||
          a.modeRank - b.modeRank ||
          a.vehicle.capacidadeCargaKg - b.vehicle.capacidadeCargaKg,
      );

    return ranked[0]?.vehicle ?? null;
  }

  private explain(
    shelter: Shelter,
    necessitaEnvio: boolean,
    emTransito: SupplyLoad,
    cargaTotalKg: number,
    veiculo: FleetVehicle | null,
    viagens: number,
  ): string[] {
    const hasTransit = !isEmptyLoad(emTransito);
    const transitReason = `Já a caminho: ${numberFormat.format(loadWeightKg(emTransito))} kg em ordens aguardando confirmação de entrega.`;

    if (!necessitaEnvio) {
      return hasTransit
        ? [
            `O estoque e a carga a caminho cobrem as próximas ${AUTONOMY_TARGET_HOURS} h. Nenhum envio necessário.`,
            transitReason,
          ]
        : [`O estoque cobre as próximas ${AUTONOMY_TARGET_HOURS} h. Nenhum envio necessário.`];
    }

    const reasons: string[] = [];

    for (const key of Object.keys(AUTONOMY_LABELS) as (keyof AutonomyHours)[]) {
      const hours = shelter.autonomiaHoras[key];
      if (hours < AUTONOMY_TARGET_HOURS) {
        reasons.push(
          `Autonomia de ${AUTONOMY_LABELS[key]} em ${numberFormat.format(hours)} h, abaixo da meta de ${AUTONOMY_TARGET_HOURS} h.`,
        );
      }
    }

    const occupancy = occupancyRate(shelter);
    if (occupancy >= 0.85) {
      reasons.push(`Ocupação em ${Math.round(occupancy * 100)}% da capacidade.`);
    }
    if (shelter.acessoViario === 'ISOLADO') {
      reasons.push('Acesso isolado: somente os modais fluvial e aéreo alcançam o abrigo.');
    }
    if (hasTransit) reasons.push(transitReason);

    if (veiculo) {
      const trips = viagens === 1 ? '1 viagem' : `${viagens} viagens`;
      reasons.push(
        `${veiculo.prefixo} (${veiculo.modelo}) leva ${numberFormat.format(cargaTotalKg)} kg em ${trips}.`,
      );
    } else {
      reasons.push(
        'Nenhum veículo disponível alcança o abrigo. Solicitar apoio da esfera estadual ou federal.',
      );
    }

    return reasons;
  }
}

function mapFactors(
  fn: (factor: ExplainabilityFactor) => number,
): Record<ExplainabilityFactor, number> {
  return {
    taxaOcupacao: fn('taxaOcupacao'),
    burnRateSuprimentos: fn('burnRateSuprimentos'),
    indiceVulnerabilidade: fn('indiceVulnerabilidade'),
    isolamentoViario: fn('isolamentoViario'),
  };
}

/**
 * Converte as contribuições em inteiros que somam exatamente 100 pelo método
 * do maior resto. Sem risco nenhum, a explicação mostra os pesos base, para
 * que a tela nunca exiba quatro zeros.
 */
function toPercentages(contributions: Record<ExplainabilityFactor, number>): AiExplainability {
  const total = sum(FACTORS.map((factor) => contributions[factor]));
  const source = total > 0 ? contributions : RISK_WEIGHTS;
  const sourceTotal = total > 0 ? total : sum(FACTORS.map((factor) => RISK_WEIGHTS[factor]));

  const shares = FACTORS.map((factor) => {
    const exact = (source[factor] / sourceTotal) * 100;
    return { factor, value: Math.floor(exact), remainder: exact - Math.floor(exact) };
  });

  let missing = 100 - sum(shares.map((share) => share.value));
  for (const share of [...shares].sort((a, b) => b.remainder - a.remainder)) {
    if (missing <= 0) break;
    share.value += 1;
    missing -= 1;
  }

  return mapFactors((factor) => shares.find((share) => share.factor === factor)?.value ?? 0);
}

function statusFor(risk: number): ShelterStatus {
  return STATUS_BANDS.find((band) => risk >= band.min)?.status ?? 'ESTÁVEL';
}

function hoursOf(stock: number, perHour: number): number {
  if (perHour <= 0) return AUTONOMY_CEILING_HOURS;
  return roundTo(Math.min(AUTONOMY_CEILING_HOURS, stock / perHour), 1);
}

function minAutonomy(autonomy: AutonomyHours): number {
  return Math.min(autonomy.agua, autonomy.alimentos, autonomy.medicamentos);
}

function deficit(perHour: number, stock: number): number {
  return Math.max(0, perHour * AUTONOMY_TARGET_HOURS - stock);
}

function tripsFor(cargaTotalKg: number, vehicle: FleetVehicle): number {
  return Math.max(1, ceilSafe(cargaTotalKg / vehicle.capacidadeCargaKg));
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}
