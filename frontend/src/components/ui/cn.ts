import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

// Os tamanhos de letra próprios (globals.css: --text-2xs, --text-13) têm de ser
// conhecidos aqui; senão o twMerge julga que `text-13` é uma cor e apaga-o ao
// lado de `text-neutral-900`.
const twMerge = extendTailwindMerge({
  extend: { theme: { text: ['2xs', '13'] } },
});

/** Junta classes e deixa a última ganhar quando duas se contradizem. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
