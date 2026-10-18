export const STORAGE_KEYS = {
  SHELTERS: 's2id_pro_shelters',
  FLEET: 's2id_pro_fleet',
  ORDERS: 's2id_pro_orders',
  OFFLINE_MODE: 's2id_pro_offline_mode',
  SIMULATION: 's2id_pro_simulation',
  SEED_VERSION: 's2id_pro_seed_version',
  THEME: 's2id_pro_theme',
} as const;

export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS];

/** Chaves do plano de contingência. O tema fica de fora: o reset não deve trocar a aparência. */
export const CONTINGENCY_KEYS: readonly StorageKey[] = [
  STORAGE_KEYS.SHELTERS,
  STORAGE_KEYS.FLEET,
  STORAGE_KEYS.ORDERS,
  STORAGE_KEYS.OFFLINE_MODE,
  STORAGE_KEYS.SIMULATION,
  STORAGE_KEYS.SEED_VERSION,
];
