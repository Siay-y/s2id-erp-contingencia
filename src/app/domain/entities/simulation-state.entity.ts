/** Estado do simulador de cenários, persistido para sobreviver ao recarregamento. */
export interface SimulationState {
  picosSimulados: number;
  ultimoPicoEm: string | null;
}

export const INITIAL_SIMULATION_STATE: Readonly<SimulationState> = {
  picosSimulados: 0,
  ultimoPicoEm: null,
};
