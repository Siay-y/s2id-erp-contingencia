import { TestBed } from '@angular/core/testing';
import { ModalService } from './modal.service';

describe('ModalService', () => {
  let modal: ModalService;

  beforeEach(() => {
    modal = TestBed.inject(ModalService);
  });

  it('aplica ícone, tamanho e ação padrão da variante', () => {
    void modal.open({ title: 'Aviso', variant: 'warning' });
    const config = modal.active()!.config;

    expect(config.icon).toBe('warning_amber');
    expect(config.size).toBe('md');
    expect(config.dismissible).toBe(true);
    expect(config.actions.map((a) => a.id)).toEqual(['ok']);
  });

  it('resolve com o id da ação escolhida', async () => {
    const result = modal.open({
      title: 'Escolha',
      actions: [
        { id: 'a', label: 'A' },
        { id: 'b', label: 'B' },
      ],
    });

    modal.choose('b');

    await expect(result).resolves.toBe('b');
    expect(modal.isOpen()).toBe(false);
  });

  it('enfileira em vez de sobrescrever a modal aberta', async () => {
    const first = modal.confirm({ title: 'Primeira' });
    const second = modal.confirm({ title: 'Segunda' });

    expect(modal.active()?.config.title).toBe('Primeira');
    expect(modal.pendingCount()).toBe(1);

    modal.choose('confirm');
    await expect(first).resolves.toBe(true);
    expect(modal.active()?.config.title).toBe('Segunda');

    modal.choose('cancel');
    await expect(second).resolves.toBe(false);
  });

  it('dispensar resolve com null e confirm vira false', async () => {
    const result = modal.confirm({ title: 'Dispensar' });
    modal.dismiss();
    await expect(result).resolves.toBe(false);
  });

  it('não dispensa modal que exige resposta', () => {
    void modal.open({ title: 'Obrigatória', dismissible: false });
    modal.dismiss();
    expect(modal.isOpen()).toBe(true);
  });

  it('closeAll resolve toda a fila com null', async () => {
    const first = modal.open({ title: 'A' });
    const second = modal.open({ title: 'B' });

    modal.closeAll();

    await expect(first).resolves.toBeNull();
    await expect(second).resolves.toBeNull();
    expect(modal.isOpen()).toBe(false);
  });
});
