import { useCallback, useMemo, useState } from 'react';
import { errorMessage } from '@/lib/errorMessage';
import { evaluateCatalogReadiness, type CatalogReadiness } from '@/lib/catalogos/readiness';
import { summarizeSectionProducts } from '@/lib/catalogos/sectionCounts';
import { buildMagazineUrl, catalogSiteUrl, expiresAtFromHours } from '@/lib/catalogos/shareLinks';
import type { PrivateCatalogDetail } from '@/lib/catalogos/types';
import { hasErrors, validateShareLinkInput, type ShareLinkErrors } from '@/lib/catalogos/validators';
import { shareLinkByWhatsApp } from '../../utils/shareActions';
import { buildShareMessage } from '../../utils/shareMessages';
import { createCatalogShareLink, reissueCatalogShareLink } from '../services/catalogShareLinksService';
import { buildCatalogSnapshot, type SnapshotProgress } from '../services/catalogSnapshotService';
import { generateShareToken } from '../services/shareTokenService';
import { invalidateCatalogCache } from '../store/catalogosStore';
import type { CategoryPreviewLookup, ProductLookup } from './useCatalogDetail';

export type ShareLinkResult = {
  url: string;
  label: string;
  expiresAt: string;
  /** `true` cuando viene de «Reemitir». */
  reissued: boolean;
};

/** `whatsapp`: al terminar abre WhatsApp con el mensaje; `none`: muestra la hoja para copiar o abrir. */
export type ShareLinkDelivery = 'whatsapp' | 'none';

export type CreateShareLinkRequest = { label: string; hours: number; delivery: ShareLinkDelivery };

export type ShareLinkFlowState = {
  readiness: CatalogReadiness;
  siteConfigured: boolean;
  creating: boolean;
  progress: SnapshotProgress | null;
  reissuingId: string | null;
  errors: ShareLinkErrors;
  submitError: string | null;
  /** Error de «Reemitir»; se muestra dentro de su hoja, no detrás. */
  reissueError: string | null;
  result: ShareLinkResult | null;
  create: (input: CreateShareLinkRequest) => Promise<boolean>;
  reissue: (shareLinkId: string, label: string, hours: number) => Promise<boolean>;
  clearReissueError: () => void;
  dismissResult: () => void;
};

/**
 * Preparación previa con lo que ya está cargado. Una categoría completa
 * cuenta con su total si ya se conoce; si no, se da por no vacía (se expande
 * al generar, y el RPC valida el resultado).
 */
export function previewReadiness(
  detail: PrivateCatalogDetail | null,
  products: ProductLookup,
  categories: CategoryPreviewLookup = new Map()
): CatalogReadiness {
  if (!detail) return evaluateCatalogReadiness([]);
  return evaluateCatalogReadiness(
    detail.sections.map((section) => {
      const summary = summarizeSectionProducts(section, products, categories);
      const unknownCategories = section.items.filter((item) => item.itemType === 'category' && !categories.has(item.referenceId)).length;
      return { title: section.title, productCount: summary.count + unknownCategories };
    })
  );
}

export function useShareLinkFlow(
  detail: PrivateCatalogDetail | null,
  products: ProductLookup,
  categories: CategoryPreviewLookup,
  reload: () => Promise<void>
): ShareLinkFlowState {
  const [creating, setCreating] = useState(false);
  const [progress, setProgress] = useState<SnapshotProgress | null>(null);
  const [reissuingId, setReissuingId] = useState<string | null>(null);
  const [errors, setErrors] = useState<ShareLinkErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [reissueError, setReissueError] = useState<string | null>(null);
  const [result, setResult] = useState<ShareLinkResult | null>(null);

  const readiness = useMemo(() => previewReadiness(detail, products, categories), [detail, products, categories]);
  const siteConfigured = catalogSiteUrl() !== null;

  const refreshAfterMutation = useCallback(async () => {
    if (!detail) return;
    invalidateCatalogCache(detail.id);
    await reload();
  }, [detail, reload]);

  const create = useCallback(
    async ({ label, hours, delivery }: CreateShareLinkRequest) => {
      if (!detail) return false;
      const validation = validateShareLinkInput({ label, hours });
      setErrors(validation);
      if (hasErrors(validation)) return false;

      setCreating(true);
      setSubmitError(null);
      setProgress(null);
      try {
        // Los productos sueltos y las categorías pequeñas ya cargadas no se vuelven a pedir.
        const snapshot = await buildCatalogSnapshot(detail, { known: { products, categories }, onProgress: setProgress });
        const token = await generateShareToken();
        const created = await createCatalogShareLink({
          catalogId: detail.id,
          snapshot,
          token: token.token,
          tokenHash: token.tokenHash,
          tokenHint: token.tokenHint,
          label,
          expiresAt: expiresAtFromHours(hours),
        });
        const next: ShareLinkResult = { url: buildMagazineUrl(token.token), label: label.trim(), expiresAt: created.expiresAt, reissued: false };
        // Sin WhatsApp (o si no abre) queda la hoja con Copiar / Abrir.
        const sent = delivery === 'whatsapp' && (await shareLinkByWhatsApp(buildShareMessage({ url: next.url, label: next.label })));
        if (!sent) setResult(next);
        await refreshAfterMutation();
        return true;
      } catch (caught) {
        setSubmitError(errorMessage(caught, 'No fue posible crear el enlace.'));
        return false;
      } finally {
        setCreating(false);
        setProgress(null);
      }
    },
    [detail, products, categories, refreshAfterMutation]
  );

  const reissue = useCallback(
    async (shareLinkId: string, label: string, hours: number) => {
      const validation = validateShareLinkInput({ label, hours });
      if (validation.hours) {
        setReissueError(validation.hours);
        return false;
      }
      setReissuingId(shareLinkId);
      setReissueError(null);
      try {
        const token = await generateShareToken();
        const reissued = await reissueCatalogShareLink({
          shareLinkId,
          token: token.token,
          tokenHash: token.tokenHash,
          tokenHint: token.tokenHint,
          expiresAt: expiresAtFromHours(hours),
        });
        setResult({ url: buildMagazineUrl(token.token), label, expiresAt: reissued.expiresAt, reissued: true });
        await refreshAfterMutation();
        return true;
      } catch (caught) {
        setReissueError(errorMessage(caught, 'No fue posible reemitir el enlace.'));
        return false;
      } finally {
        setReissuingId(null);
      }
    },
    [refreshAfterMutation]
  );

  const clearReissueError = useCallback(() => setReissueError(null), []);
  const dismissResult = useCallback(() => setResult(null), []);

  return {
    readiness,
    siteConfigured,
    creating,
    progress,
    reissuingId,
    errors,
    submitError,
    reissueError,
    result,
    create,
    reissue,
    clearReissueError,
    dismissResult,
  };
}
