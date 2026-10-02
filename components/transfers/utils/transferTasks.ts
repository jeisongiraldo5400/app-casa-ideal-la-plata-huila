/** Secciones de la lista «Traslados» y contadores (puro). */
import type { TransferSummary, TransferTasks } from './transferModel';
import type { TransferMode } from './transferRules';

/**
 * «carrying» (traslados que transporto) ya no es sección: desde 2026-10-02 no
 * se pide transportador al sacar. El servidor lo sigue mandando para los viejos.
 */
export type TransferSectionKey = 'toDispatch' | 'toReceive' | 'toConfirmReturn';

export type TransferSection = {
  key: TransferSectionKey;
  /** Etiqueta corta para la tarjeta de sección. */
  tabLabel: string;
  /** Qué se hace aquí, en pocas palabras (debajo de la etiqueta). */
  hint: string;
  /** Ícono de MaterialIcons. */
  icon: 'outbox' | 'move-to-inbox' | 'assignment-return';
  title: string;
  empty: string;
  /** Acción con la que se abre el detalle desde esta sección. */
  mode: Exclude<TransferMode, 'view'> | null;
};

export const TRANSFER_SECTIONS: readonly TransferSection[] = [
  {
    key: 'toDispatch',
    tabLabel: 'Sacar',
    hint: 'Sacar productos de la bodega',
    icon: 'outbox',
    title: 'Por sacar',
    empty: 'No tienes productos por sacar.',
    mode: 'dispatch',
  },
  {
    key: 'toReceive',
    tabLabel: 'Recibir',
    hint: 'Confirmar lo que llegó',
    icon: 'move-to-inbox',
    title: 'Por recibir',
    empty: 'No tienes traslados por recibir.',
    mode: 'receive',
  },
  {
    key: 'toConfirmReturn',
    tabLabel: 'Devoluciones',
    hint: 'Vuelven al origen',
    icon: 'assignment-return',
    title: 'Devoluciones por confirmar',
    empty: 'No hay devoluciones por confirmar.',
    mode: 'return',
  },
];

export function countTasks(tasks: TransferTasks): number {
  return tasks.toDispatch.length + tasks.toReceive.length + tasks.toConfirmReturn.length;
}

export function overdueCount(rows: readonly TransferSummary[]): number {
  return rows.filter((row) => row.isOverdue).length;
}

/**
 * Sección inicial: «Por recibir» si hay algo vencido ahí; si no, la primera
 * con algo pendiente (en el orden de las pestañas); si no hay nada, «Por sacar».
 */
export function defaultSection(tasks: TransferTasks | null): TransferSectionKey {
  if (!tasks) return 'toDispatch';
  if (overdueCount(tasks.toReceive) > 0) return 'toReceive';
  return TRANSFER_SECTIONS.find((section) => tasks[section.key].length > 0)?.key ?? 'toDispatch';
}

/** Vencidos primero; luego por fecha límite y por número. */
export function sortForList(rows: readonly TransferSummary[]): TransferSummary[] {
  return [...rows].sort((a, b) => {
    if (a.isOverdue !== b.isOverdue) return a.isOverdue ? -1 : 1;
    const dueA = a.dueAt ?? a.createdAt ?? '';
    const dueB = b.dueAt ?? b.createdAt ?? '';
    if (dueA !== dueB) return dueA < dueB ? -1 : 1;
    return a.orderNumber.localeCompare(b.orderNumber);
  });
}

/** Texto del contador de Inicio. */
export function homeCardSubtitle(tasks: TransferTasks | null): string {
  if (!tasks) return 'Sacar y recibir';
  const toReceive = tasks.toReceive.length;
  const overdue = overdueCount(tasks.toReceive);
  if (toReceive === 0) {
    const toDispatch = tasks.toDispatch.length;
    return toDispatch > 0 ? `${toDispatch} por sacar` : 'Nada por recibir';
  }
  return overdue > 0 ? `${toReceive} por recibir · ${overdue} vencido${overdue === 1 ? '' : 's'}` : `${toReceive} por recibir`;
}
