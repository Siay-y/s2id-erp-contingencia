import { VehicleStatus } from '../../domain/entities/fleet-vehicle.entity';
import {
  AutonomyHours,
  RoadAccess,
  Shelter,
  ShelterStatus,
} from '../../domain/entities/shelter.entity';
import {
  AUTONOMY_CRITICAL_HOURS,
  AUTONOMY_TARGET_HOURS,
} from '../../domain/use-cases/prescriptive-logistics-ai.use-case';

/**
 * Cor é sinal, não decoração: só existem tons para o que pede ação. Tudo o
 * que está sob controle fica em `neutral` e se apoia na tipografia.
 */
export type UiTone = 'critical' | 'warning' | 'positive' | 'neutral';

export const SHELTER_STATUS_TONES: Readonly<Record<ShelterStatus, UiTone>> = {
  ESTÁVEL: 'neutral',
  ATENÇÃO: 'warning',
  SOBRECARGA: 'warning',
  'COLAPSO LOGÍSTICO': 'critical',
};

export const SHELTER_STATUS_LABELS: Readonly<Record<ShelterStatus, string>> = {
  ESTÁVEL: 'Estável',
  ATENÇÃO: 'Atenção',
  SOBRECARGA: 'Sobrecarga',
  'COLAPSO LOGÍSTICO': 'Colapso logístico',
};

export const ROAD_ACCESS_LABELS: Readonly<Record<RoadAccess, string>> = {
  LIVRE: 'Acesso livre',
  RESTRITO: 'Acesso restrito',
  ISOLADO: 'Acesso isolado',
};

/** Verde só para o que pode sair agora; o resto da frota fica em neutro. */
export const VEHICLE_STATUS_TONES: Readonly<Record<VehicleStatus, UiTone>> = {
  DISPONÍVEL: 'positive',
  'EM MISSÃO': 'neutral',
  MANUTENÇÃO: 'neutral',
};

export const VEHICLE_STATUS_LABELS: Readonly<Record<VehicleStatus, string>> = {
  DISPONÍVEL: 'Disponível',
  'EM MISSÃO': 'Em missão',
  MANUTENÇÃO: 'Manutenção',
};

export type SupplyKey = keyof AutonomyHours;

export const SUPPLY_LABELS: Readonly<Record<SupplyKey, string>> = {
  agua: 'Água',
  alimentos: 'Refeições',
  medicamentos: 'Medicamentos',
};

/** Mesmos limites do motor prescritivo, para a cor nunca contradizer o risco calculado. */
export function autonomyTone(hours: number): UiTone {
  if (hours <= AUTONOMY_CRITICAL_HOURS) return 'critical';
  if (hours < AUTONOMY_TARGET_HOURS / 2) return 'warning';
  return 'neutral';
}

export function scarcestSupply(shelter: Shelter): { key: SupplyKey; hours: number } {
  const entries = Object.entries(shelter.autonomiaHoras) as [SupplyKey, number][];
  const [key, hours] = entries.reduce((min, entry) => (entry[1] < min[1] ? entry : min));
  return { key, hours };
}
