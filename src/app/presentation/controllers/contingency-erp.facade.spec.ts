import { TestBed } from '@angular/core/testing';
import { ModalService } from '../../core/ui/modal/modal.service';
import { provideContingencyData } from '../../data/provide-contingency-data';
import { createSeedShelters } from '../../data/seed/contingency.seed';
import { ContingencyRepository } from '../../domain/repositories/contingency.repository';
import { ContingencyErpFacade, QUICK_CHECK_IN } from './contingency-erp.facade';

describe('ContingencyErpFacade', () => {
  let facade: ContingencyErpFacade;
  let modal: ModalService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideContingencyData()] });
    facade = TestBed.inject(ContingencyErpFacade);
    modal = TestBed.inject(ModalService);
  });

  afterEach(() => modal.closeAll());

  it('abre com o abrigo de maior risco em foco e a prescrição calculada', () => {
    const risks = facade.shelters().map((s) => s.riscoColapsoIA);

    expect(risks).toEqual([...risks].sort((a, b) => b - a));
    expect(facade.selectedShelter()?.id).toBe('abrigo-mucum-rs');
    expect(facade.currentPrescription()?.veiculo?.prefixo).toBe('ARCANJO-03');
    expect(facade.pendingSyncCount()).toBe(1);
  });

  it('a prioridade é o abrigo de maior risco com envio a fazer', () => {
    expect(facade.priority()?.shelter.id).toBe('abrigo-mucum-rs');
    expect(facade.priority()?.prescription.veiculo?.prefixo).toBe('ARCANJO-03');
  });

  it('com todos os abrigos abastecidos, não há prioridade', () => {
    const repository = TestBed.inject(ContingencyRepository);
    for (const shelter of repository.getShelters()) {
      repository.updateShelter({
        ...shelter,
        estoque: { aguaLitros: 1_000_000, refeicoesUnidades: 1_000_000, kitsMedicos: 10_000 },
      });
    }

    expect(facade.priority()).toBeNull();
  });

  it('despachar pelo id seleciona o abrigo antes de abrir o manifesto', async () => {
    const pending = facade.executeAiPrescription('abrigo-blumenau-sc');

    expect(facade.selectedShelter()?.id).toBe('abrigo-blumenau-sc');
    modal.choose('cancel');
    await pending;
  });

  it('a prescrição acompanha o abrigo selecionado', () => {
    facade.selectShelter('abrigo-jaboatao-pe');

    expect(facade.selectedShelter()?.nome).toBe('Centro Comunitário de Jaboatão');
    expect(facade.currentPrescription()?.necessitaEnvio).toBe(false);
  });

  it('check-in atualiza os signals sem refresh manual', () => {
    const before = facade.kpis().populacaoAbrigada;

    facade.registerCheckIn(
      'abrigo-jaboatao-pe',
      QUICK_CHECK_IN.pessoas,
      QUICK_CHECK_IN.vulneraveis,
    );

    expect(facade.kpis().populacaoAbrigada).toBe(before + QUICK_CHECK_IN.pessoas);
    expect(
      facade.shelters().find((s) => s.id === 'abrigo-jaboatao-pe')?.gruposVulneraveis.pets,
    ).toBe(8 + QUICK_CHECK_IN.vulneraveis.pets);
  });

  it('regra violada vira modal de erro em vez de exceção', () => {
    facade.registerCheckIn('abrigo-jaboatao-pe', 1, { idosos: 3 });

    expect(modal.active()?.config.variant).toBe('danger');
    expect(modal.active()?.config.message).toContain('total de pessoas');
  });

  it('consumir estoque reduz a autonomia do abrigo', () => {
    const before = facade.selectedShelter()!.autonomiaHoras.agua;

    facade.consumeStock('abrigo-mucum-rs', 6);

    expect(facade.selectedShelter()!.autonomiaHoras.agua).toBeLessThan(before);
  });

  async function dispatchToPriority(): Promise<void> {
    const pending = facade.executeAiPrescription();
    modal.choose('confirm');
    await pending;
    modal.closeAll();
  }

  it('confirmar o manifesto registra a ordem em trânsito sem mexer no estoque', async () => {
    const stockBefore = facade.selectedShelter()!.estoque;
    const pending = facade.executeAiPrescription();

    expect(modal.active()?.config.eyebrow).toBe('Manifesto logístico');
    expect(facade.isBusy()).toBe(true);
    modal.choose('confirm');

    const order = await pending;

    expect(order?.origem).toBe('IA_PRESCRITIVA');
    expect(order?.veiculoPrefixo).toBe('ARCANJO-03');
    expect(order?.entregueEm).toBeNull();
    expect(facade.dispatchOrders()[0].id).toBe(order?.id);
    expect(facade.fleet().find((v) => v.prefixo === 'ARCANJO-03')?.status).toBe('EM MISSÃO');
    expect(facade.shelters().find((s) => s.id === 'abrigo-mucum-rs')?.estoque).toEqual(stockBefore);
    expect(facade.isBusy()).toBe(false);
    expect(modal.active()?.config.title).toBe('Ordem de despacho registrada');
  });

  it('com a carga a caminho, a IA não manda de novo e a prioridade passa ao próximo', async () => {
    await dispatchToPriority();
    facade.selectShelter('abrigo-mucum-rs');

    expect(facade.sheltersAwaitingDelivery().has('abrigo-mucum-rs')).toBe(true);
    expect(facade.currentPrescription()?.necessitaEnvio).toBe(false);
    expect(facade.selectedInTransit()?.aguaLitros).toBeGreaterThan(0);
    expect(facade.priority()?.shelter.id).not.toBe('abrigo-mucum-rs');
  });

  it('confirmar a entrega abastece o abrigo e devolve o veículo no município atendido', async () => {
    await dispatchToPriority();
    const before = facade.shelters().find((s) => s.id === 'abrigo-mucum-rs')!;

    const confirming = facade.confirmDelivery('frota-arcanjo-03');
    expect(modal.active()?.config.title).toBe('A carga do ARCANJO-03 chegou?');
    modal.choose('confirm');
    await confirming;

    const after = facade.shelters().find((s) => s.id === 'abrigo-mucum-rs')!;
    const vehicle = facade.fleet().find((v) => v.id === 'frota-arcanjo-03');
    expect(after.estoque.aguaLitros).toBeGreaterThan(before.estoque.aguaLitros);
    expect(after.riscoColapsoIA).toBeLessThan(before.riscoColapsoIA);
    expect(facade.sheltersAwaitingDelivery().size).toBe(0);
    expect(vehicle?.status).toBe('DISPONÍVEL');
    expect(vehicle?.localizacaoAtual).toBe('Muçum/RS');
  });

  it('responder "ainda em rota" mantém a carga em trânsito', async () => {
    await dispatchToPriority();

    const confirming = facade.confirmDelivery('frota-arcanjo-03');
    modal.choose('cancel');
    await confirming;

    expect(facade.fleet().find((v) => v.id === 'frota-arcanjo-03')?.status).toBe('EM MISSÃO');
    expect(facade.sheltersAwaitingDelivery().has('abrigo-mucum-rs')).toBe(true);
  });

  it('veículo sem entrega pendente não confirma entrega', async () => {
    await facade.confirmDelivery('frota-vtr-12');

    expect(modal.active()?.config.message).toContain('não tem entrega pendente');
    expect(facade.fleet().find((v) => v.id === 'frota-vtr-12')?.status).toBe('MANUTENÇÃO');
  });

  it('liberar da manutenção devolve o veículo à frota disponível', () => {
    facade.releaseVehicleFromMaintenance('frota-vtr-12');

    const vehicle = facade.fleet().find((v) => v.id === 'frota-vtr-12');
    expect(vehicle?.status).toBe('DISPONÍVEL');
    expect(vehicle?.localizacaoAtual).toBe('Oficina conveniada, Petrópolis/RJ');
    expect(facade.kpis().frotaDisponivel).toBe(4);
  });

  it('veículo fora da manutenção não pode ser liberado', () => {
    facade.releaseVehicleFromMaintenance('frota-abts-01');

    expect(modal.active()?.config.message).toContain('não está em manutenção');
  });

  it('cancelar o manifesto não grava nada', async () => {
    const ordersBefore = facade.dispatchOrders().length;
    const pending = facade.executeAiPrescription();

    modal.choose('cancel');

    await expect(pending).resolves.toBeNull();
    expect(facade.dispatchOrders()).toHaveLength(ordersBefore);
  });

  it('em modo offline o despacho entra na fila e reconectar sincroniza', async () => {
    facade.toggleOfflineMode();
    expect(facade.isOfflineMode()).toBe(true);

    const pending = facade.executeAiPrescription();
    modal.choose('confirm');
    await pending;

    expect(facade.pendingSyncCount()).toBe(2);

    facade.toggleOfflineMode();

    expect(facade.isOfflineMode()).toBe(false);
    expect(facade.pendingSyncCount()).toBe(0);
  });

  it('o pico simulado só acontece depois da confirmação', async () => {
    const before = facade.kpis().populacaoAbrigada;
    const pending = facade.simulateMassInfluxCrisis();

    expect(facade.kpis().populacaoAbrigada).toBe(before);
    modal.choose('confirm');
    await pending;

    expect(facade.kpis().populacaoAbrigada).toBeGreaterThan(before);
    expect(facade.simulationState().picosSimulados).toBe(1);
    expect(modal.active()?.config.eyebrow).toBe('Pico simulado nº 1');
  });

  it('restaurar volta ao seed e limpa a seleção', async () => {
    facade.selectShelter('abrigo-blumenau-sc');
    facade.registerCheckIn('abrigo-blumenau-sc', 10);

    const pending = facade.resetAll();
    expect(modal.active()?.config.actions.at(-1)?.destructive).toBe(true);
    modal.choose('confirm');
    await pending;

    expect(facade.kpis().populacaoAbrigada).toBe(seedPopulation());
    expect(facade.selectedShelter()?.id).toBe('abrigo-mucum-rs');
  });
});

function seedPopulation(): number {
  return createSeedShelters(new Date()).reduce((total, s) => total + s.ocupacaoAtual, 0);
}
