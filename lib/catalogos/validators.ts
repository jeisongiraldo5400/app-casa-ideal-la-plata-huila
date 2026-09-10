import { MAX_SHARE_LINK_HOURS, MIN_SHARE_LINK_HOURS } from './shareLinks';

// Los límites replican los CHECK de la migración 20260914120000 y los
// mensajes de `catalogo-casa-ideal/src/features/private-catalogs/validations.ts`,
// para que el error se vea en el formulario y no como un fallo de Postgres.

export const TITLE_MIN = 2;
export const TITLE_MAX = 120;
export const INTRODUCTION_MAX = 1200;
export const LABEL_MIN = 2;
export const LABEL_MAX = 120;

export function validateTitle(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.length < TITLE_MIN) return 'Escribe al menos 2 caracteres.';
  if (trimmed.length > TITLE_MAX) return 'Máximo 120 caracteres.';
  return null;
}

/** Texto opcional: vacío → null, con tope de longitud. */
export function normalizeOptionalText(value: string, maxLength: number): { value: string | null; error: string | null } {
  const trimmed = value.trim();
  if (trimmed.length > maxLength) return { value: trimmed, error: `Máximo ${maxLength} caracteres.` };
  return { value: trimmed.length > 0 ? trimmed : null, error: null };
}

export type CreateCatalogInput = { internalTitle: string; publicTitle: string };
export type CreateCatalogErrors = Partial<Record<keyof CreateCatalogInput, string>>;

/** El título público es opcional al crear: vacío hereda el nombre interno. */
export function validateCreateCatalog(input: CreateCatalogInput): CreateCatalogErrors {
  const errors: CreateCatalogErrors = {};
  const internal = validateTitle(input.internalTitle);
  if (internal) errors.internalTitle = internal;
  if (input.publicTitle.trim().length > 0) {
    const publicError = validateTitle(input.publicTitle);
    if (publicError) errors.publicTitle = publicError;
  }
  return errors;
}

export type CoverTextInput = { internalTitle: string; publicTitle: string; introduction: string };
export type CoverTextErrors = Partial<Record<keyof CoverTextInput, string>>;

export function validateCoverText(input: CoverTextInput): CoverTextErrors {
  const errors: CoverTextErrors = {};
  const internal = validateTitle(input.internalTitle);
  if (internal) errors.internalTitle = internal;
  const publicError = validateTitle(input.publicTitle);
  if (publicError) errors.publicTitle = publicError;
  const intro = normalizeOptionalText(input.introduction, INTRODUCTION_MAX);
  if (intro.error) errors.introduction = 'La introducción es muy larga.';
  return errors;
}

export type ShareLinkInput = { label: string; hours: number };
export type ShareLinkErrors = Partial<Record<keyof ShareLinkInput, string>>;

export function validateShareLinkInput(input: ShareLinkInput): ShareLinkErrors {
  const errors: ShareLinkErrors = {};
  const label = input.label.trim();
  if (label.length > 0 && label.length < LABEL_MIN) errors.label = `Escribe al menos ${LABEL_MIN} caracteres o deja el campo vacío.`;
  else if (label.length > LABEL_MAX) errors.label = 'Máximo 120 caracteres.';
  if (!Number.isInteger(input.hours)) errors.hours = 'La vigencia debe ser un número de horas.';
  else if (input.hours < MIN_SHARE_LINK_HOURS) errors.hours = 'La vigencia mínima es de 1 hora.';
  else if (input.hours > MAX_SHARE_LINK_HOURS) errors.hours = 'La vigencia máxima es de 30 días.';
  return errors;
}

export function hasErrors(errors: Record<string, string | undefined>): boolean {
  return Object.values(errors).some(Boolean);
}
