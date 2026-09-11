import { Platform } from 'react-native';

/** Hoja carta: el tamaño por defecto de expo-print (recibos). */
export const LETTER_PDF_SIZE = { width: 612, height: 792 } as const;

/** Chrome (web) y el WebView de Android imprimen a 96 px CSS por pulgada: 1 px = 0,75 pt. */
const CSS_PX_TO_PT = 0.75;

const UNIT_TO_PT: Record<string, number> = {
  mm: 72 / 25.4,
  cm: 72 / 2.54,
  in: 72,
  pt: 1,
  px: CSS_PX_TO_PT,
};

type PageSize = { readonly width: number; readonly height: number };
export type PageMarginsPt = { top: number; right: number; bottom: number; left: number };
export type PdfPrintOptions = { html: string; width: number; height: number; margins?: PageMarginsPt };

function toPt(value: string): number {
  const m = value.trim().match(/^([\d.]+)([a-z]*)$/i);
  if (!m) return 0;
  const factor = UNIT_TO_PT[(m[2] || 'px').toLowerCase()];
  return factor ? Number(m[1]) * factor : 0;
}

/** Márgenes de la regla `@page` del documento, en puntos (orden CSS: arriba, derecha, abajo, izquierda). */
export function pageMarginsPt(html: string): PageMarginsPt {
  const margin = html.match(/@page\s*\{[^}]*?margin:\s*([^;}]+)/)?.[1];
  if (!margin) return { top: 0, right: 0, bottom: 0, left: 0 };
  const [top, right = top, bottom = top, left = right] = margin.trim().split(/\s+/).map(toPt);
  return { top, right, bottom, left };
}

/**
 * Opciones de `Print.printToFileAsync` para que el PDF salga igual en Android, en iPhone y en la web.
 *
 * - Android: el WebView (Chromium) respeta `@page` e imprime 1 px CSS = 0,75 pt, igual que Chrome.
 * - iPhone: expo-print dibuja con un WKWebView del ancho de la hoja en puntos (1 px CSS = 1 pt) y
 *   UIPrintPageRenderer ignora `@page`, así que sin ajuste el documento salía un 33 % más grande,
 *   sin márgenes y partido en dos hojas. Allí se pasan los márgenes de `@page` en puntos y se
 *   reduce el documento a la escala de Chrome.
 */
export function pdfPrintOptions(html: string, size: PageSize, platform: string = Platform.OS): PdfPrintOptions {
  if (platform !== 'ios') return { html, width: size.width, height: size.height };
  return {
    html: html.replace('</head>', `<style>html { zoom: ${CSS_PX_TO_PT}; }</style></head>`),
    width: size.width,
    height: size.height,
    margins: pageMarginsPt(html),
  };
}
