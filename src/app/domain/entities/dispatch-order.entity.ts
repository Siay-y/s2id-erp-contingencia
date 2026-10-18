import { DomainError } from '../errors/domain.error';
import { isNonNegativeInteger, isNonNegativeNumber, roundTo } from '../shared/numbers';

export type DispatchOrigin = 'IA_PRESCRITIVA' | 'MANUAL_OPERADOR';

export interface SupplyLoad {
  aguaLitros: number;
  refeicoes: number;
  kitsMedicos: number;
}

/** Ordem de missão logística registrada no plano de contingência. */
export interface DispatchOrder {
  id: string;
  protocoloS2id: string;
  dataHora: string;
  abrigoId: string;
  abrigoNome: string;
  veiculoPrefixo: string;
  itensDespachados: SupplyLoad;
  tempoDecisaoMinutos: number;
  origem: DispatchOrigin;
  /** `false` enquanto a ordem espera na fila offline para subir ao S2iD. */
  sincronizadoNuvem: boolean;
  /**
   * `null` enquanto a carga está em trânsito. O estoque do abrigo só recebe
   * os itens quando a equipe confirma a entrega.
   */
  entregueEm: string | null;
}

/**
 * O que o operador, ou a IA, decide. Protocolo, horário, nome do abrigo e
 * sincronização são atribuídos pelo repositório no momento do registro.
 */
export type DispatchOrderDraft = Pick<
  DispatchOrder,
  'abrigoId' | 'veiculoPrefixo' | 'itensDespachados' | 'tempoDecisaoMinutos' | 'origem'
>;

export const DISPATCH_ORIGINS: readonly DispatchOrigin[] = ['IA_PRESCRITIVA', 'MANUAL_OPERADOR'];

/** Peso de embarque por unidade, usado para casar a carga com a capacidade do veículo. */
export const SUPPLY_UNIT_WEIGHT_KG: Readonly<Record<keyof SupplyLoad, number>> = {
  aguaLitros: 1,
  refeicoes: 0.5,
  kitsMedicos: 2.5,
};

export const EMPTY_SUPPLY_LOAD: Readonly<SupplyLoad> = {
  aguaLitros: 0,
  refeicoes: 0,
  kitsMedicos: 0,
};

export function loadWeightKg(load: SupplyLoad): number {
  return roundTo(
    load.aguaLitros * SUPPLY_UNIT_WEIGHT_KG.aguaLitros +
      load.refeicoes * SUPPLY_UNIT_WEIGHT_KG.refeicoes +
      load.kitsMedicos * SUPPLY_UNIT_WEIGHT_KG.kitsMedicos,
    1,
  );
}

export function isEmptyLoad(load: SupplyLoad): boolean {
  return load.aguaLitros === 0 && load.refeicoes === 0 && load.kitsMedicos === 0;
}

export function validateDispatchDraft(draft: DispatchOrderDraft): void {
  const { aguaLitros, refeicoes, kitsMedicos } = draft.itensDespachados;

  if (![aguaLitros, refeicoes, kitsMedicos].every(isNonNegativeInteger)) {
    throw new DomainError(
      'INVALID_DISPATCH',
      'As quantidades despachadas precisam ser números inteiros e não negativos.',
    );
  }
  if (isEmptyLoad(draft.itensDespachados)) {
    throw new DomainError('INVALID_DISPATCH', 'Informe ao menos um item para despachar.');
  }
  if (!isNonNegativeNumber(draft.tempoDecisaoMinutos)) {
    throw new DomainError('INVALID_DISPATCH', 'O tempo de decisão não pode ser negativo.');
  }
  if (!DISPATCH_ORIGINS.includes(draft.origem)) {
    throw new DomainError('INVALID_DISPATCH', 'Origem da ordem de despacho desconhecida.');
  }
}

/** Ordens gravadas antes da confirmação de entrega existir não têm o campo e contam como entregues. */
export function isInTransit(order: DispatchOrder): boolean {
  return order.entregueEm === null;
}

export function confirmOrderDelivery(order: DispatchOrder, at: string): DispatchOrder {
  if (!isInTransit(order)) {
    throw new DomainError(
      'ORDER_ALREADY_DELIVERED',
      `A entrega da ordem ${order.protocoloS2id} já foi confirmada.`,
    );
  }
  return { ...order, entregueEm: at };
}

/** Soma do que está a caminho do abrigo e ainda não entrou no estoque. */
export function loadInTransit(orders: readonly DispatchOrder[], shelterId: string): SupplyLoad {
  return orders
    .filter((order) => order.abrigoId === shelterId && isInTransit(order))
    .reduce<SupplyLoad>(
      (total, order) => ({
        aguaLitros: total.aguaLitros + order.itensDespachados.aguaLitros,
        refeicoes: total.refeicoes + order.itensDespachados.refeicoes,
        kitsMedicos: total.kitsMedicos + order.itensDespachados.kitsMedicos,
      }),
      { ...EMPTY_SUPPLY_LOAD },
    );
}

/** Formato `S2ID-PC-UF-AAAA-NNNNNN`, com a sequência zerada à esquerda. */
export function buildS2idProtocol(uf: string, issuedAt: Date, sequence: number): string {
  return `S2ID-PC-${uf}-${issuedAt.getFullYear()}-${String(sequence).padStart(6, '0')}`;
}
