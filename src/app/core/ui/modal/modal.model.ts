export type ModalVariant = 'info' | 'warning' | 'danger' | 'success';

export type ModalSize = 'sm' | 'md' | 'lg';

export type ModalActionAppearance = 'filled' | 'tonal' | 'outlined' | 'text';

export interface ModalAction<T extends string = string> {
  id: T;
  label: string;
  icon?: string;
  appearance?: ModalActionAppearance;
  /** Pinta a ação com a cor de perigo; para exclusões e operações sem volta. */
  destructive?: boolean;
  /** Recebe o foco ao abrir. Sem nenhuma marcada, o foco vai para a última ação. */
  autofocus?: boolean;
}

export interface ModalDetailItem {
  label: string;
  value: string;
  icon?: string;
  emphasis?: boolean;
}

/** Bloco de pares rótulo e valor, como as seções de um manifesto. */
export interface ModalDetailGroup {
  title: string;
  icon?: string;
  items: readonly ModalDetailItem[];
}

export interface ModalConfig<T extends string = string> {
  title: string;
  variant?: ModalVariant;
  /** Linha pequena acima do título, em caixa alta. */
  eyebrow?: string;
  message?: string;
  /** Glifo do Material Symbols. Sem ele, cada variante usa o seu ícone padrão. */
  icon?: string;
  details?: readonly ModalDetailGroup[];
  bulletsTitle?: string;
  bullets?: readonly string[];
  actions?: readonly ModalAction<T>[];
  /** ESC, clique no fundo e botão de fechar. Desligado em decisões que exigem resposta. */
  dismissible?: boolean;
  size?: ModalSize;
}

export type ResolvedModalConfig = Required<
  Pick<ModalConfig, 'variant' | 'icon' | 'dismissible' | 'size' | 'actions'>
> &
  Omit<ModalConfig, 'variant' | 'icon' | 'dismissible' | 'size' | 'actions'>;

export interface ModalInstance {
  id: number;
  config: ResolvedModalConfig;
  /** `null` quando a modal é dispensada sem escolher uma ação. */
  resolve: (actionId: string | null) => void;
}

export interface ConfirmModalOptions {
  title: string;
  message?: string;
  variant?: ModalVariant;
  eyebrow?: string;
  icon?: string;
  details?: readonly ModalDetailGroup[];
  bulletsTitle?: string;
  bullets?: readonly string[];
  confirmLabel?: string;
  confirmIcon?: string;
  cancelLabel?: string;
  destructive?: boolean;
  size?: ModalSize;
}

export interface AlertModalOptions {
  title: string;
  message?: string;
  variant?: ModalVariant;
  eyebrow?: string;
  icon?: string;
  details?: readonly ModalDetailGroup[];
  bulletsTitle?: string;
  bullets?: readonly string[];
  okLabel?: string;
  size?: ModalSize;
}

export const MODAL_VARIANT_ICONS: Readonly<Record<ModalVariant, string>> = {
  info: 'info',
  warning: 'warning_amber',
  danger: 'error',
  success: 'check_circle',
};

/** Tons do design system (`data-tone`) que pintam cada variante. */
export const MODAL_VARIANT_TONES: Readonly<Record<ModalVariant, string>> = {
  info: 'neutral',
  warning: 'warning',
  danger: 'critical',
  success: 'positive',
};
