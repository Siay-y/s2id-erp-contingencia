export type DomainErrorCode =
  | 'SHELTER_NOT_FOUND'
  | 'VEHICLE_NOT_FOUND'
  | 'VEHICLE_UNAVAILABLE'
  | 'VEHICLE_NOT_IN_MISSION'
  | 'VEHICLE_NOT_IN_MAINTENANCE'
  | 'ORDER_NOT_FOUND'
  | 'ORDER_ALREADY_DELIVERED'
  | 'INVALID_SHELTER'
  | 'INVALID_VEHICLE'
  | 'INVALID_CHECK_IN'
  | 'INVALID_DISPATCH';

/**
 * Violação de regra de negócio. A mensagem já sai pronta para a interface,
 * e o `code` permite que a apresentação trate cada caso sem comparar textos.
 */
export class DomainError extends Error {
  readonly code: DomainErrorCode;

  constructor(code: DomainErrorCode, message: string) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
  }
}
