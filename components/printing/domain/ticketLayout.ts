import { formatCOP } from '@/lib/creditCalculator';

/** Font A on 58 mm thermal paper (PT-210: 384 dots / 32 chars). */
export const TICKET_WIDTH = 32;

export type TicketAlign = 'left' | 'center' | 'right';

export type TicketLine =
  | {
      type: 'text';
      text: string;
      align?: TicketAlign;
      bold?: boolean;
      size?: 1 | 2;
    }
  | { type: 'separator' }
  | { type: 'spacer'; lines?: number };

export function sanitizeSpaces(value: string | null | undefined): string {
  return String(value ?? '')
    .replace(/\u00a0|\u202f|\u2007/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function formatTicketMoney(value: number): string {
  return sanitizeSpaces(formatCOP(value));
}

export function clip(text: string, max: number): string {
  const value = sanitizeSpaces(text);
  if (value.length <= max) return value;
  if (max <= 3) return value.slice(0, Math.max(0, max));
  return `${value.slice(0, max - 3)}...`;
}

export function padRow(left: string, right: string, width = TICKET_WIDTH): string {
  const rightText = sanitizeSpaces(right);
  const leftText = sanitizeSpaces(left);
  if (leftText.length + 1 + rightText.length <= width) {
    return leftText + ' '.repeat(width - leftText.length - rightText.length) + rightText;
  }
  const maxLeft = Math.max(0, width - rightText.length - 1);
  const clippedLeft = clip(leftText, maxLeft);
  const gap = Math.max(1, width - clippedLeft.length - rightText.length);
  return clippedLeft + ' '.repeat(gap) + rightText;
}

export function wrapText(text: string, width = TICKET_WIDTH): string[] {
  const value = sanitizeSpaces(text);
  if (!value) return [''];

  const words = value.split(' ');
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    if (word.length > width) {
      if (current) {
        lines.push(current);
        current = '';
      }
      for (let index = 0; index < word.length; index += width) {
        lines.push(word.slice(index, index + width));
      }
      continue;
    }

    const next = current ? `${current} ${word}` : word;
    if (next.length <= width) {
      current = next;
    } else {
      lines.push(current);
      current = word;
    }
  }

  if (current) lines.push(current);
  return lines;
}

export function textLines(
  value: string,
  style?: Pick<Extract<TicketLine, { type: 'text' }>, 'align' | 'bold' | 'size'>
): TicketLine[] {
  return wrapText(value).map((line) => ({
    type: 'text',
    text: line,
    ...style,
  }));
}
