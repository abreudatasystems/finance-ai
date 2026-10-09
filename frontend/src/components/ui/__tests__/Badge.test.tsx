import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Badge, EmptyState, ErrorState, LoadingState, type BadgeTone } from '@/components/ui';

describe('Badge', () => {
  it('defaults to the neutral tone', () => {
    render(<Badge>Rascunho</Badge>);
    expect(screen.getByText('Rascunho')).toHaveClass('bg-neutral-100', 'text-neutral-700');
  });

  it.each<[BadgeTone, string]>([
    ['success', 'bg-emerald-50'],
    ['warning', 'bg-amber-50'],
    ['danger', 'bg-rose-50'],
    ['info', 'bg-sky-50'],
    ['neutral', 'bg-neutral-100'],
  ])('renders the %s tone', (tone, cls) => {
    render(<Badge tone={tone}>Estado</Badge>);
    expect(screen.getByText('Estado')).toHaveClass(cls);
  });

  it('passes through extra props', () => {
    render(
      <Badge title="Pago em 31/08" className="uppercase">
        Pago
      </Badge>,
    );
    const el = screen.getByText('Pago');
    expect(el).toHaveAttribute('title', 'Pago em 31/08');
    expect(el).toHaveClass('uppercase');
  });
});

describe('LoadingState', () => {
  it('is a status region with the default label', () => {
    render(<LoadingState />);
    expect(screen.getByRole('status')).toHaveTextContent('A carregar…');
  });

  it('accepts a custom label', () => {
    render(<LoadingState label="A ler a fatura…" />);
    expect(screen.getByRole('status')).toHaveTextContent('A ler a fatura…');
  });
});

describe('EmptyState', () => {
  it('shows the title, description and action', () => {
    render(
      <EmptyState
        title="Ainda não há fornecedores"
        description="Crie o primeiro."
        action={<button type="button">Novo fornecedor</button>}
      />,
    );
    expect(screen.getByText('Ainda não há fornecedores')).toBeInTheDocument();
    expect(screen.getByText('Crie o primeiro.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Novo fornecedor' })).toBeInTheDocument();
  });

  it('renders without the optional parts', () => {
    const { container } = render(<EmptyState title="Vazio" />);
    expect(screen.getByText('Vazio')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(container.querySelector('svg')).not.toBeNull();
  });
});

describe('ErrorState', () => {
  it('is announced as an alert', () => {
    render(<ErrorState message="Não foi possível carregar." />);
    expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível carregar.');
  });
});
