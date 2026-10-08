import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Junta classes e deixa a última ganhar quando duas se contradizem. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
