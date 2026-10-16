import { TestBed } from '@angular/core/testing';
import { DomainError } from '../../domain/errors/domain.error';
import { ContingencyRepository } from '../../domain/repositories/contingency.repository';
import { provideContingencyData } from '../provide-contingency-data';
import { STORAGE_KEYS } from '../storage/storage-keys';

function createRepository(): ContingencyRepository {
  TestBed.configureTestingModule({ providers: [provideContingencyData()] });
  return TestBed.inject(ContingencyRepository);
}

describe('LocalStorageContingencyRepository', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  it('popula o localStorage com o seed no primeiro acesso', () => {
    const repository = createRepository();

    expect(repository.getShelters()).toHaveLength(4);
    expect(repository.getFleet()).toHaveLength(4);
    expect(repository.isOfflineMode()).toBe(false);
    for (const key of [
      STORAGE_KEYS.SHELTERS,
      STORAGE_KEYS.FLEET,
      STORAGE_KEYS.ORDERS,
      STORAGE_KEYS.OFFLINE_MODE,
      STORAGE_KEYS.SIMULATION,
    ]) {
      expect(localStorage.getItem(key)).not.toBeNull();
    }
  });

  it('não sobrescreve dados existentes ao iniciar', () => {
    const first = createRepository();
    first.registerCheckIn('abrigo-jaboatao-pe', {
      pessoas: 4,
      idosos: 1,
      criancas: 2,
      pcd: 0,
      pets: 1,
    });

    TestBed.resetTestingModule();
    const second = createRepository();

    expect(second.getShelterById('abrigo-jaboatao-pe')?.ocupacaoAtual).toBe(100);
  });

  it('volta ao seed quando o JSON gravado está corrompido', () => {
    localStorage.setItem(STORAGE_KEYS.SHELTERS, '{quebrado');
    const repository = createRepository();

    expect(repository.getShelters()).toHaveLength(4);
  });

  it('o check-in soma pessoas e grupos e reavalia o risco', () => {
    const repository = createRepository();
    const before = repository.getShelterById('abrigo-jaboatao-pe')!;

    const after = repository.registerCheckIn('abrigo-jaboatao-pe', {
      pessoas: 60,
      idosos: 20,
      criancas: 20,
      pcd: 5,
      pets: 10,
    });

    expect(after.ocupacaoAtual).toBe(before.ocupacaoAtual + 60);
    expect(after.gruposVulneraveis.pets).toBe(before.gruposVulneraveis.pets + 10);
    expect(after.riscoColapsoIA).toBeGreaterThan(before.riscoColapsoIA);
  });

  it('recusa check-in com grupos maiores que o total de pessoas', () => {
    const repository = createRepository();

    expect(() =>
      repository.registerCheckIn('abrigo-jaboatao-pe', {
        pessoas: 2,
        idosos: 2,
        criancas: 1,
        pcd: 0,
        pets: 0,
      }),
    ).toThrow(DomainError);
  });

  it('o despacho grava a ordem, abastece o abrigo e coloca o veículo em missão', () => {
    const repository = createRepository();
    const before = repository.getShelterById('abrigo-mucum-rs')!;

    const order = repository.registerDispatchOrder({
      abrigoId: 'abrigo-mucum-rs',
      veiculoPrefixo: 'ARCANJO-03',
      itensDespachados: { aguaLitros: 800, refeicoes: 200, kitsMedicos: 10 },
      tempoDecisaoMinutos: 3,
      origem: 'IA_PRESCRITIVA',
    });

    const after = repository.getShelterById('abrigo-mucum-rs')!;
    const vehicle = repository.getFleet().find((item) => item.prefixo === 'ARCANJO-03')!;

    expect(order.protocoloS2id).toMatch(/^S2ID-PC-RS-\d{4}-000003$/);
    expect(order.sincronizadoNuvem).toBe(true);
    expect(repository.getDispatchOrders()[0].id).toBe(order.id);
    expect(after.estoque.aguaLitros).toBe(before.estoque.aguaLitros + 800);
    expect(after.autonomiaHoras.agua).toBeGreaterThan(before.autonomiaHoras.agua);
    expect(vehicle.status).toBe('EM MISSÃO');
  });

  it('não grava nada quando o veículo está indisponível', () => {
    const repository = createRepository();
    const ordersBefore = repository.getDispatchOrders().length;
    const stockBefore = repository.getShelterById('abrigo-petropolis-rj')!.estoque;

    expect(() =>
      repository.registerDispatchOrder({
        abrigoId: 'abrigo-petropolis-rj',
        veiculoPrefixo: 'VTR-12',
        itensDespachados: { aguaLitros: 100, refeicoes: 0, kitsMedicos: 0 },
        tempoDecisaoMinutos: 10,
        origem: 'MANUAL_OPERADOR',
      }),
    ).toThrow(DomainError);

    expect(repository.getDispatchOrders()).toHaveLength(ordersBefore);
    expect(repository.getShelterById('abrigo-petropolis-rj')!.estoque).toEqual(stockBefore);
  });

  it('recusa despacho terrestre para abrigo isolado', () => {
    const repository = createRepository();

    expect(() =>
      repository.registerDispatchOrder({
        abrigoId: 'abrigo-mucum-rs',
        veiculoPrefixo: 'ABTS-01',
        itensDespachados: { aguaLitros: 1000, refeicoes: 0, kitsMedicos: 0 },
        tempoDecisaoMinutos: 5,
        origem: 'MANUAL_OPERADOR',
      }),
    ).toThrow(DomainError);
    expect(repository.getFleet().find((item) => item.prefixo === 'ABTS-01')?.status).toBe(
      'DISPONÍVEL',
    );
  });

  it('em modo offline a ordem entra na fila e reconectar descarrega a fila', () => {
    const repository = createRepository();
    repository.setOfflineMode(true);

    repository.registerDispatchOrder({
      abrigoId: 'abrigo-blumenau-sc',
      veiculoPrefixo: 'ABTS-01',
      itensDespachados: { aguaLitros: 2000, refeicoes: 500, kitsMedicos: 10 },
      tempoDecisaoMinutos: 6,
      origem: 'MANUAL_OPERADOR',
    });

    expect(repository.getSyncQueue()).toHaveLength(2);
    expect(repository.syncPendingOrders()).toEqual([]);

    repository.setOfflineMode(false);

    expect(repository.getSyncQueue()).toHaveLength(0);
    expect(repository.getDispatchOrders().every((order) => order.sincronizadoNuvem)).toBe(true);
  });

  it('o pico de emergência aumenta a ocupação, agrava o acesso e conta a simulação', () => {
    const repository = createRepository();
    const before = repository.getShelters();

    const after = repository.simulateEmergencyPeak();

    after.forEach((shelter, index) => {
      expect(shelter.ocupacaoAtual).toBeGreaterThan(before[index].ocupacaoAtual);
      expect(shelter.estoque.aguaLitros).toBeLessThanOrEqual(before[index].estoque.aguaLitros);
    });
    expect(repository.getShelterById('abrigo-jaboatao-pe')?.acessoViario).toBe('RESTRITO');
    expect(repository.getSimulationState().picosSimulados).toBe(1);
  });

  it('notifica os inscritos a cada gravação', () => {
    const repository = createRepository();
    let calls = 0;
    const unsubscribe = repository.subscribe(() => calls++);

    repository.setOfflineMode(true);
    unsubscribe();
    repository.setOfflineMode(false);

    expect(calls).toBe(1);
  });

  it('o reset restaura o seed e zera a simulação', () => {
    const repository = createRepository();
    repository.simulateEmergencyPeak();
    repository.setOfflineMode(true);

    repository.resetToDefaults();

    expect(repository.getShelterById('abrigo-mucum-rs')?.ocupacaoAtual).toBe(342);
    expect(repository.getSimulationState().picosSimulados).toBe(0);
    expect(repository.isOfflineMode()).toBe(false);
  });
});
