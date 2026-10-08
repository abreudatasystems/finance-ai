import type React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Table, THead, TBody, Th, Tr, Td, TableMessage } from '@/components/ui';

function renderRow(cell: React.ReactNode) {
  return render(
    <Table>
      <TBody>
        <Tr>{cell}</Tr>
      </TBody>
    </Table>,
  );
}

describe('Table cells', () => {
  it('Td numeric is right-aligned with tabular figures', () => {
    renderRow(<Td numeric>1 234,56 €</Td>);
    expect(screen.getByRole('cell')).toHaveClass('text-right', 'tabular-nums', 'whitespace-nowrap');
  });

  it('Td align="right" behaves like numeric', () => {
    renderRow(<Td align="right">x</Td>);
    expect(screen.getByRole('cell')).toHaveClass('text-right', 'tabular-nums');
  });

  it('Td align="center" centres', () => {
    renderRow(<Td align="center">x</Td>);
    const td = screen.getByRole('cell');
    expect(td).toHaveClass('text-center');
    expect(td).not.toHaveClass('text-right');
  });

  it('plain Td is not right-aligned', () => {
    renderRow(<Td>texto</Td>);
    const td = screen.getByRole('cell');
    expect(td).not.toHaveClass('text-right');
    expect(td).not.toHaveClass('tabular-nums');
  });

  it('Th numeric is right-aligned and a column header', () => {
    render(
      <Table>
        <THead>
          <tr>
            <Th numeric>Total</Th>
          </tr>
        </THead>
      </Table>,
    );
    const th = screen.getByRole('columnheader', { name: 'Total' });
    expect(th).toHaveClass('text-right');
    expect(th).toHaveAttribute('scope', 'col');
  });

  it('Tr is clickable only when it has onClick', () => {
    render(
      <Table>
        <TBody>
          <Tr data-testid="a" onClick={() => {}}>
            <Td>a</Td>
          </Tr>
          <Tr data-testid="b">
            <Td>b</Td>
          </Tr>
        </TBody>
      </Table>,
    );
    expect(screen.getByTestId('a')).toHaveClass('cursor-pointer');
    expect(screen.getByTestId('b')).not.toHaveClass('cursor-pointer');
  });

  it('TableMessage spans the given columns', () => {
    render(
      <Table>
        <TBody>
          <TableMessage colSpan={5}>Sem resultados</TableMessage>
        </TBody>
      </Table>,
    );
    expect(screen.getByRole('cell', { name: 'Sem resultados' })).toHaveAttribute('colspan', '5');
  });
});
