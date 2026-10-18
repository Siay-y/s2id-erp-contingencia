import { DispatchOrder } from '../../domain/entities/dispatch-order.entity';
import { FleetVehicle } from '../../domain/entities/fleet-vehicle.entity';
import { AutonomyHours, Shelter, ShelterStatus } from '../../domain/entities/shelter.entity';
import { roundTo } from '../../domain/shared/numbers';

/** Referência de tempo entre o alerta e a decisão de despacho usada nos indicadores da Meta 9.2.4. */
export const DECISION_TIME_TARGET_MINUTES = 14;

export type SupplyLabel = 'água' | 'refeições' | 'medicamentos';

export interface CriticalAutonomy {
  horas: number;
  item: SupplyLabel;
  abrigoId: string;
  abrigoNome: string;
}

export interface Meta924Kpis {
  populacaoAbrigada: number;
  capacidadeTotal: number;
  ocupacaoPct: number;
  idosos: number;
  criancas: number;
  pcd: number;
  pets: number;
  /** Idosos, crianças e PcD. Uma pessoa idosa com deficiência conta nos dois grupos. */
  vulneraveis: number;
  abrigosEmAlerta: number;
  abrigosPorStatus: Readonly<Record<ShelterStatus, number>>;
  totalAbrigos: number;
  autonomiaCritica: CriticalAutonomy | null;
  /** Média de todas as ordens; `null` antes da primeira. */
  tempoDecisaoMedioMin: number | null;
  tempoDecisaoIaMin: number | null;
  tempoDecisaoManualMin: number | null;
  metaTempoDecisaoMin: number;
  dentroDaMetaDeDecisao: boolean | null;
  frotaTotal: number;
  frotaDisponivel: number;
  frotaEmMissao: number;
  frotaManutencao: number;
  frotaOperacionalPct: number;
}

const AUTONOMY_ITEMS: readonly { key: keyof AutonomyHours; label: SupplyLabel }[] = [
  { key: 'agua', label: 'água' },
  { key: 'alimentos', label: 'refeições' },
  { key: 'medicamentos', label: 'medicamentos' },
];

/** Função pura: o facade só a envolve em `computed()`, e o teste a chama direto. */
export function computeMeta924Kpis(
  shelters: readonly Shelter[],
  fleet: readonly FleetVehicle[],
  orders: readonly DispatchOrder[],
): Meta924Kpis {
  const populacaoAbrigada = sumBy(shelters, (s) => s.ocupacaoAtual);
  const capacidadeTotal = sumBy(shelters, (s) => s.capacidadeTotal);
  const idosos = sumBy(shelters, (s) => s.gruposVulneraveis.idosos);
  const criancas = sumBy(shelters, (s) => s.gruposVulneraveis.criancas);
  const pcd = sumBy(shelters, (s) => s.gruposVulneraveis.pcd);

  const frotaDisponivel = fleet.filter((v) => v.status === 'DISPONÍVEL').length;
  const tempoDecisaoMedioMin = average(orders.map((o) => o.tempoDecisaoMinutos));

  return {
    populacaoAbrigada,
    capacidadeTotal,
    ocupacaoPct: percent(populacaoAbrigada, capacidadeTotal),
    idosos,
    criancas,
    pcd,
    pets: sumBy(shelters, (s) => s.gruposVulneraveis.pets),
    vulneraveis: idosos + criancas + pcd,
    abrigosEmAlerta: shelters.filter(
      (s) => s.status === 'SOBRECARGA' || s.status === 'COLAPSO LOGÍSTICO',
    ).length,
    abrigosPorStatus: {
      ESTÁVEL: shelters.filter((s) => s.status === 'ESTÁVEL').length,
      ATENÇÃO: shelters.filter((s) => s.status === 'ATENÇÃO').length,
      SOBRECARGA: shelters.filter((s) => s.status === 'SOBRECARGA').length,
      'COLAPSO LOGÍSTICO': shelters.filter((s) => s.status === 'COLAPSO LOGÍSTICO').length,
    },
    totalAbrigos: shelters.length,
    autonomiaCritica: findCriticalAutonomy(shelters),
    tempoDecisaoMedioMin,
    tempoDecisaoIaMin: average(
      orders.filter((o) => o.origem === 'IA_PRESCRITIVA').map((o) => o.tempoDecisaoMinutos),
    ),
    tempoDecisaoManualMin: average(
      orders.filter((o) => o.origem === 'MANUAL_OPERADOR').map((o) => o.tempoDecisaoMinutos),
    ),
    metaTempoDecisaoMin: DECISION_TIME_TARGET_MINUTES,
    dentroDaMetaDeDecisao:
      tempoDecisaoMedioMin === null ? null : tempoDecisaoMedioMin <= DECISION_TIME_TARGET_MINUTES,
    frotaTotal: fleet.length,
    frotaDisponivel,
    frotaEmMissao: fleet.filter((v) => v.status === 'EM MISSÃO').length,
    frotaManutencao: fleet.filter((v) => v.status === 'MANUTENÇÃO').length,
    frotaOperacionalPct: percent(frotaDisponivel, fleet.length),
  };
}

/** Abrigo vazio não entra: autonomia de 720 h por falta de gente não é boa notícia a destacar. */
function findCriticalAutonomy(shelters: readonly Shelter[]): CriticalAutonomy | null {
  let critical: CriticalAutonomy | null = null;

  for (const shelter of shelters) {
    if (shelter.ocupacaoAtual === 0) continue;

    for (const { key, label } of AUTONOMY_ITEMS) {
      const horas = shelter.autonomiaHoras[key];
      if (critical === null || horas < critical.horas) {
        critical = { horas, item: label, abrigoId: shelter.id, abrigoNome: shelter.nome };
      }
    }
  }
  return critical;
}

function sumBy<T>(items: readonly T[], pick: (item: T) => number): number {
  return items.reduce((total, item) => total + pick(item), 0);
}

function average(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return roundTo(values.reduce((total, value) => total + value, 0) / values.length, 1);
}

function percent(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 100) : 0;
}
