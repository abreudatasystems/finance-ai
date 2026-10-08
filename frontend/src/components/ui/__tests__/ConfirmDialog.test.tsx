import { describe, it, expect, vi } from 'vitest';
import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { ConfirmProvider, useConfirm } from '@/components/ui';

function Harness({ danger = false }: { danger?: boolean }) {
  const confirm = useConfirm();
  const [result, setResult] = useState<string>('none');
  return (
    <>
      <button
        type="button"
        onClick={async () => {
          const ok = await confirm({
            title: 'Apagar fornecedor?',
            description: 'Isto não se pode desfazer.',
            confirmLabel: danger ? 'Apagar' : undefined,
            danger,
          });
          setResult(String(ok));
        }}
      >
        Abrir
      </button>
      <output data-testid="result">{result}</output>
    </>
  );
}

function setup(danger = false) {
  const user = userEvent.setup();
  render(
    <ConfirmProvider>
      <Harness danger={danger} />
    </ConfirmProvider>,
  );
  return user;
}

describe('ConfirmDialog / useConfirm', () => {
  it('throws outside the provider', () => {
    // React logs the thrown error; keep the test output clean.
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => renderHook(() => useConfirm())).toThrow(/ConfirmProvider/);
  });

  it('opens an alertdialog with title, description and focus on confirm', async () => {
    const user = setup();
    await user.click(screen.getByRole('button', { name: 'Abrir' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Apagar fornecedor?' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveTextContent('Isto não se pode desfazer.');
    expect(screen.getByRole('button', { name: 'Confirmar' })).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeInTheDocument();
  });

  it('resolves true on confirm and closes', async () => {
    const user = setup();
    await user.click(screen.getByRole('button', { name: 'Abrir' }));
    await user.click(screen.getByRole('button', { name: 'Confirmar' }));
    await waitFor(() => expect(screen.getByTestId('result')).toHaveTextContent('true'));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('resolves false on cancel', async () => {
    const user = setup();
    await user.click(screen.getByRole('button', { name: 'Abrir' }));
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.getByTestId('result')).toHaveTextContent('false'));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('resolves false on Escape', async () => {
    const user = setup();
    await user.click(screen.getByRole('button', { name: 'Abrir' }));
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.getByTestId('result')).toHaveTextContent('false'));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('uses the danger style and the custom confirm label', async () => {
    const user = setup(true);
    await user.click(screen.getByRole('button', { name: 'Abrir' }));
    expect(screen.getByRole('button', { name: 'Apagar' })).toHaveClass('bg-rose-600');
  });

  it('resolves the promise returned by the hook', async () => {
    const { result } = renderHook(() => useConfirm(), { wrapper: ConfirmProvider });
    let promise!: Promise<boolean>;
    act(() => {
      promise = result.current({ title: 'Continuar?' });
    });
    await userEvent.click(await screen.findByRole('button', { name: 'Confirmar' }));
    await expect(promise).resolves.toBe(true);
  });
});
