import { TestBed } from '@angular/core/testing';
import { ModalComponent } from './modal.component';
import { ModalService } from './modal.service';

describe('ModalComponent', () => {
  async function setup() {
    const fixture = TestBed.createComponent(ModalComponent);
    const modal = TestBed.inject(ModalService);
    await fixture.whenStable();
    return { fixture, modal, host: fixture.nativeElement as HTMLElement };
  }

  it('renderiza título, detalhes e ações da modal da vez', async () => {
    const { fixture, modal, host } = await setup();

    void modal.confirm({
      title: 'Despachar suprimentos',
      variant: 'danger',
      details: [{ title: 'Carga', items: [{ label: 'Água', value: '1.000 L' }] }],
      confirmLabel: 'Confirmar despacho',
    });
    await fixture.whenStable();

    const dialog = host.querySelector('[role="alertdialog"]');
    expect(dialog?.textContent).toContain('Despachar suprimentos');
    expect(dialog?.textContent).toContain('1.000 L');
    expect(dialog?.getAttribute('data-tone')).toBe('critical');
    expect(host.querySelector('[data-autofocus]')?.textContent).toContain('Confirmar despacho');
  });

  it('ESC dispensa a modal', async () => {
    const { fixture, modal } = await setup();
    const result = modal.confirm({ title: 'Sair?' });
    await fixture.whenStable();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    await expect(result).resolves.toBe(false);
  });

  it('o clique na ação resolve com o id dela', async () => {
    const { fixture, modal, host } = await setup();
    const result = modal.confirm({ title: 'Confirmar?', confirmLabel: 'Sim' });
    await fixture.whenStable();

    host.querySelector<HTMLButtonElement>('[data-autofocus]')!.click();

    await expect(result).resolves.toBe(true);
  });

  it('trava a rolagem do body enquanto há modal aberta', async () => {
    const { fixture, modal } = await setup();

    void modal.alert({ title: 'Aviso' });
    await fixture.whenStable();
    expect(document.body.classList.contains('modal-open')).toBe(true);

    modal.closeAll();
    await fixture.whenStable();
    expect(document.body.classList.contains('modal-open')).toBe(false);
  });
});
