import { DomainError } from '../errors/domain.error';
import { isNonNegativeInteger, isNonNegativeNumber } from '../shared/numbers';
import { SupplyLoad } from './dispatch-order.entity';
import { TransportMode } from './fleet-vehicle.entity';

export type ShelterStatus = 'ESTÁVEL' | 'ATENÇÃO' | 'SOBRECARGA' | 'COLAPSO LOGÍSTICO';

/** Condição da via de acesso. Define quais modais da frota conseguem chegar ao abrigo. */
export type RoadAccess = 'LIVRE' | 'RESTRITO' | 'ISOLADO';

/**
 * Pessoas que pedem cuidado diferenciado. `pets` atende às famílias
 * multiespécies previstas no PN-PDC: animais não ocupam vaga, mas consomem
 * água e pesam no índice de vulnerabilidade.
 */
export interface VulnerableGroups {
  idosos: number;
  criancas: number;
  pcd: number;
  pets: number;
}

export interface ShelterStock {
  aguaLitros: number;
  refeicoesUnidades: number;
  kitsMedicos: number;
}

export interface AutonomyHours {
  agua: number;
  alimentos: number;
  medicamentos: number;
}

/** Quanto cada fator respondeu pelo risco, em pontos percentuais inteiros que somam 100. */
export interface AiExplainability {
  taxaOcupacao: number;
  burnRateSuprimentos: number;
  indiceVulnerabilidade: number;
  isolamentoViario: number;
}

export type ExplainabilityFactor = keyof AiExplainability;

export interface Shelter {
  id: string;
  nome: string;
  municipio: string;
  uf: string;
  baciaHidrografica: string;
  acessoViario: RoadAccess;
  capacidadeTotal: number;
  ocupacaoAtual: number;
  gruposVulneraveis: VulnerableGroups;
  estoque: ShelterStock;
  autonomiaHoras: AutonomyHours;
  /** 0 a 100. */
  riscoColapsoIA: number;
  status: ShelterStatus;
  aiExplainability: AiExplainability;
  atualizadoEm: string;
}

/** Campos calculados pelo motor prescritivo. Nunca são editados à mão. */
export type ShelterAssessment = Pick<
  Shelter,
  'autonomiaHoras' | 'riscoColapsoIA' | 'status' | 'aiExplainability'
>;

/** O que o operador informa; o restante sai de `PrescriptiveLogisticsAiUseCase.assess`. */
export type ShelterOperationalData = Omit<Shelter, keyof ShelterAssessment>;

/** Chegada de um grupo familiar. `idosos`, `criancas` e `pcd` são contados dentro de `pessoas`. */
export interface ShelterCheckIn {
  pessoas: number;
  idosos: number;
  criancas: number;
  pcd: number;
  pets: number;
}

export const SHELTER_STATUSES: readonly ShelterStatus[] = [
  'ESTÁVEL',
  'ATENÇÃO',
  'SOBRECARGA',
  'COLAPSO LOGÍSTICO',
];

/** Do melhor para o pior: a ordem é usada para agravar o acesso em um pico. */
export const ROAD_ACCESS_LEVELS: readonly RoadAccess[] = ['LIVRE', 'RESTRITO', 'ISOLADO'];

/**
 * Modais que alcançam o abrigo, em ordem crescente de custo operacional.
 * A aeronave é o recurso mais escasso e fica sempre por último.
 */
export const REACHABLE_MODES: Readonly<Record<RoadAccess, readonly TransportMode[]>> = {
  LIVRE: ['TERRESTRE', 'FLUVIAL', 'AÉREO'],
  RESTRITO: ['TERRESTRE', 'FLUVIAL', 'AÉREO'],
  ISOLADO: ['FLUVIAL', 'AÉREO'],
};

/** Pico simulado: chegada em massa proporcional à capacidade, seguida de horas sem reposição. */
export const EMERGENCY_SURGE = {
  chegadaPctCapacidade: 0.18,
  idososPct: 0.2,
  criancasPct: 0.25,
  pcdPct: 0.06,
  petsPct: 0.12,
  horasSemReposicao: 12,
} as const;

const UF_PATTERN = /^[A-Z]{2}$/;

export function occupancyRate(shelter: Pick<Shelter, 'capacidadeTotal' | 'ocupacaoAtual'>): number {
  return shelter.capacidadeTotal > 0 ? shelter.ocupacaoAtual / shelter.capacidadeTotal : 1;
}

export function availableBeds(shelter: Pick<Shelter, 'capacidadeTotal' | 'ocupacaoAtual'>): number {
  return Math.max(0, shelter.capacidadeTotal - shelter.ocupacaoAtual);
}

export function validateShelter(shelter: ShelterOperationalData): void {
  const fail = (message: string): never => {
    throw new DomainError('INVALID_SHELTER', message);
  };

  if (!shelter.nome.trim()) fail('Informe o nome do abrigo.');
  if (!shelter.municipio.trim()) fail('Informe o município do abrigo.');
  if (!UF_PATTERN.test(shelter.uf)) fail('A UF precisa ter duas letras maiúsculas.');
  if (!ROAD_ACCESS_LEVELS.includes(shelter.acessoViario))
    fail('Condição de acesso viário desconhecida.');
  if (!Number.isInteger(shelter.capacidadeTotal) || shelter.capacidadeTotal <= 0) {
    fail('A capacidade total precisa ser um número inteiro maior que zero.');
  }
  if (!isNonNegativeInteger(shelter.ocupacaoAtual)) {
    fail('A ocupação atual precisa ser um número inteiro e não negativo.');
  }

  const { idosos, criancas, pcd, pets } = shelter.gruposVulneraveis;
  if (![idosos, criancas, pcd, pets].every(isNonNegativeInteger)) {
    fail('Os grupos vulneráveis precisam ser números inteiros e não negativos.');
  }
  // Idosos e crianças são faixas etárias disjuntas; PcD pode pertencer a qualquer uma delas.
  if (idosos + criancas > shelter.ocupacaoAtual || pcd > shelter.ocupacaoAtual) {
    fail('Os grupos vulneráveis não podem ultrapassar a ocupação atual.');
  }

  const { aguaLitros, refeicoesUnidades, kitsMedicos } = shelter.estoque;
  if (![aguaLitros, refeicoesUnidades, kitsMedicos].every(isNonNegativeNumber)) {
    fail('O estoque não pode ter valores negativos.');
  }
}

export function validateCheckIn(checkIn: ShelterCheckIn): void {
  const { pessoas, idosos, criancas, pcd, pets } = checkIn;
  const fail = (message: string): never => {
    throw new DomainError('INVALID_CHECK_IN', message);
  };

  if (!Number.isInteger(pessoas) || pessoas < 1) fail('O check-in precisa de ao menos uma pessoa.');
  if (![idosos, criancas, pcd, pets].every(isNonNegativeInteger)) {
    fail('Os grupos vulneráveis precisam ser números inteiros e não negativos.');
  }
  if (idosos + criancas > pessoas || pcd > pessoas) {
    fail('Idosos, crianças e PcD são contados dentro do total de pessoas.');
  }
}

/**
 * Registra a chegada mesmo acima da capacidade: em desastre ninguém fica na
 * porta, e a sobrecarga aparece no risco em vez de bloquear o acolhimento.
 */
export function applyCheckIn(
  shelter: ShelterOperationalData,
  checkIn: ShelterCheckIn,
  at: string,
): ShelterOperationalData {
  validateCheckIn(checkIn);
  const groups = shelter.gruposVulneraveis;

  return {
    ...shelter,
    ocupacaoAtual: shelter.ocupacaoAtual + checkIn.pessoas,
    gruposVulneraveis: {
      idosos: groups.idosos + checkIn.idosos,
      criancas: groups.criancas + checkIn.criancas,
      pcd: groups.pcd + checkIn.pcd,
      pets: groups.pets + checkIn.pets,
    },
    atualizadoEm: at,
  };
}

export function receiveSupplies(
  shelter: ShelterOperationalData,
  load: SupplyLoad,
  at: string,
): ShelterOperationalData {
  return {
    ...shelter,
    estoque: {
      aguaLitros: shelter.estoque.aguaLitros + load.aguaLitros,
      refeicoesUnidades: shelter.estoque.refeicoesUnidades + load.refeicoes,
      kitsMedicos: shelter.estoque.kitsMedicos + load.kitsMedicos,
    },
    atualizadoEm: at,
  };
}

export function canReach(shelter: Pick<Shelter, 'acessoViario'>, modal: TransportMode): boolean {
  return REACHABLE_MODES[shelter.acessoViario].includes(modal);
}

export function worsenRoadAccess(access: RoadAccess): RoadAccess {
  const index = ROAD_ACCESS_LEVELS.indexOf(access);
  return ROAD_ACCESS_LEVELS[Math.min(index + 1, ROAD_ACCESS_LEVELS.length - 1)];
}

/**
 * Chegada em massa de um pico de cheia. O consumo das horas sem reposição
 * depende das taxas do motor prescritivo e é aplicado por quem orquestra.
 */
export function applyEmergencySurge(
  shelter: ShelterOperationalData,
  at: string,
): ShelterOperationalData {
  const arrivals = Math.max(
    1,
    Math.ceil(shelter.capacidadeTotal * EMERGENCY_SURGE.chegadaPctCapacidade),
  );

  const surged = applyCheckIn(
    shelter,
    {
      pessoas: arrivals,
      idosos: Math.floor(arrivals * EMERGENCY_SURGE.idososPct),
      criancas: Math.floor(arrivals * EMERGENCY_SURGE.criancasPct),
      pcd: Math.floor(arrivals * EMERGENCY_SURGE.pcdPct),
      pets: Math.ceil(arrivals * EMERGENCY_SURGE.petsPct),
    },
    at,
  );

  return { ...surged, acessoViario: worsenRoadAccess(shelter.acessoViario) };
}
