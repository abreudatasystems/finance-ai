// Componentes base da interface. Uma página usa estes em vez de escrever
// botões, tabelas e campos à mão — é isso que mantém a aplicação igual a si
// própria de ecrã para ecrã.
export { cn } from './cn';
export { Button, IconButton } from './Button';
export type { ButtonProps, ButtonVariant, ButtonSize } from './Button';
export { Card, CardHeader, CardBody } from './Card';
export { Table, THead, TBody, Th, Tr, Td, TableMessage } from './Table';
export { Field, Input, Select, Textarea, inputClass } from './Field';
export { LoadingState, EmptyState, ErrorState } from './States';
export { Badge } from './Badge';
export type { BadgeTone } from './Badge';
export { ConfirmProvider, useConfirm } from './ConfirmDialog';
export { Stat } from './Stat';
export type { StatTone } from './Stat';
export { Segmented } from './Segmented';
