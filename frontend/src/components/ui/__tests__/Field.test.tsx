import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Field, Input } from '@/components/ui';

describe('Field', () => {
  it('links the label to the input (htmlFor and id)', () => {
    render(<Field label="NIF">{(p) => <Input {...p} />}</Field>);
    const input = screen.getByLabelText('NIF');
    const label = screen.getByText('NIF');
    expect(input.id).toBeTruthy();
    expect(label).toHaveAttribute('for', input.id);
    expect(input).not.toHaveAttribute('aria-invalid');
    expect(input).not.toHaveAttribute('aria-describedby');
  });

  it('describes the input with the hint', () => {
    render(
      <Field label="Email" hint="Para faturas">
        {(p) => <Input {...p} />}
      </Field>,
    );
    const input = screen.getByLabelText('Email');
    expect(input).toHaveAccessibleDescription('Para faturas');
    expect(input).not.toHaveAttribute('aria-invalid');
  });

  it('marks the input invalid and describes it with the error (error wins over hint)', () => {
    render(
      <Field label="NIF" hint="9 digitos" error="NIF inválido">
        {(p) => <Input {...p} />}
      </Field>,
    );
    const input = screen.getByLabelText('NIF');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('NIF inválido');
    expect(screen.queryByText('9 digitos')).not.toBeInTheDocument();
    const describedBy = input.getAttribute('aria-describedby')!;
    expect(document.getElementById(describedBy)).toHaveTextContent('NIF inválido');
  });

  it('shows a decorative asterisk when required', () => {
    render(
      <Field label="Nome" required>
        {(p) => <Input {...p} />}
      </Field>,
    );
    expect(screen.getByText('*')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByRole('textbox', { name: 'Nome' })).toBeInTheDocument();
  });

  it('gives each field its own id', () => {
    render(
      <>
        <Field label="A">{(p) => <Input {...p} />}</Field>
        <Field label="B">{(p) => <Input {...p} />}</Field>
      </>,
    );
    expect(screen.getByLabelText('A').id).not.toBe(screen.getByLabelText('B').id);
  });
});
