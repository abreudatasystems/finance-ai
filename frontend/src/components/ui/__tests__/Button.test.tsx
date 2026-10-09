import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button, IconButton, type ButtonVariant } from '@/components/ui';

describe('Button', () => {
  it('defaults to type="button" so it never submits a form by accident', () => {
    render(<Button>Guardar</Button>);
    expect(screen.getByRole('button', { name: 'Guardar' })).toHaveAttribute('type', 'button');
  });

  it('keeps an explicit type="submit"', () => {
    render(<Button type="submit">Enviar</Button>);
    expect(screen.getByRole('button', { name: 'Enviar' })).toHaveAttribute('type', 'submit');
  });

  it.each<[ButtonVariant, string]>([
    ['primary', 'bg-neutral-900'],
    ['accent', 'bg-emerald-600'],
    ['secondary', 'bg-white'],
    ['danger', 'bg-rose-600'],
    ['ghost', 'bg-transparent'],
  ])('renders the %s variant', (variant, cls) => {
    render(<Button variant={variant}>X</Button>);
    expect(screen.getByRole('button')).toHaveClass(cls);
  });

  it('applies the size classes', () => {
    render(<Button size="sm">Pequeno</Button>);
    expect(screen.getByRole('button')).toHaveClass('h-7');
  });

  it('lets a className override a variant class', () => {
    render(<Button className="bg-red-500">X</Button>);
    const btn = screen.getByRole('button');
    expect(btn).toHaveClass('bg-red-500');
    expect(btn).not.toHaveClass('bg-neutral-900');
  });

  it('loading disables the button and sets aria-busy', async () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick} icon={<span data-testid="icon" />}>
        Pagar
      </Button>,
    );
    const btn = screen.getByRole('button', { name: 'Pagar' });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute('aria-busy', 'true');
    // The spinner replaces the icon while loading.
    expect(screen.queryByTestId('icon')).not.toBeInTheDocument();
    await userEvent.click(btn);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('has no aria-busy when not loading and renders the icon', () => {
    render(<Button icon={<span data-testid="icon" />}>Pagar</Button>);
    const btn = screen.getByRole('button');
    expect(btn).not.toHaveAttribute('aria-busy');
    expect(btn).toBeEnabled();
    expect(screen.getByTestId('icon')).toBeInTheDocument();
  });

  it('calls onClick', async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Ok</Button>);
    await userEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe('IconButton', () => {
  it('exposes the label as accessible name and tooltip', () => {
    render(
      <IconButton label="Apagar fornecedor">
        <svg />
      </IconButton>,
    );
    const btn = screen.getByRole('button', { name: 'Apagar fornecedor' });
    expect(btn).toHaveAttribute('aria-label', 'Apagar fornecedor');
    expect(btn).toHaveAttribute('title', 'Apagar fornecedor');
    expect(btn).toHaveAttribute('type', 'button');
  });

  it('requires a label at the type level', () => {
    const el = (
      // @ts-expect-error -- `label` is mandatory: an icon-only button needs a name.
      <IconButton>
        <svg />
      </IconButton>
    );
    expect(el).toBeTruthy();
  });

  it('uses the md size when asked', () => {
    render(
      <IconButton label="Menu" size="md">
        <svg />
      </IconButton>,
    );
    expect(screen.getByRole('button', { name: 'Menu' })).toHaveClass('size-8');
  });
});
