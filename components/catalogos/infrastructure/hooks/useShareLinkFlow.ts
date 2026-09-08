import { useCallback, useMemo, useState } from 'react';
import { errorMessage } from '@/lib/errorMessage';
import { evaluateCatalogReadiness, type CatalogReadiness } from '@/lib/catalogos/readiness';
import { buildMagazineUrl, catalogSiteUrl, expiresAtFromHours } from '@/lib/catalogos/shareLinks';
import type { PrivateCatalogDetail } from '@/lib/catalogos/types';
import { hasErrors, validateShareLinkInput, type ShareLinkErrors } from '@/lib/catalogos/validators';
import { createCatalogShareLink, reissueCatalogShareLink } from '../services/catalogShareLinksService';
import { buildCatalogSnapshot, type SnapshotProgress } from '../services/catalogSnapshotService';
import { generateShareToken } from '../services/shareTokenService';
import type { ProductLookup } from './useCatalogDetail';

export type ShareLinkResult = {
  url: string;
  label: string;
  expiresAt: string;
  /** `true` cuando viene de «Reemitir». */
  reissued: boolean;
};

export type ShareLinkFlowState = {
  readiness: CatalogReadiness;
  siteConfigured: boolean;
  creating: boolean;
  progress: SnapshotProgress | null;
  reissuingId: string | null;
  errors: ShareLinkErrors;
  submitError: string | null;
  result: ShareLinkResult | null;
  create: (input: { label: string; hours: number }) => Promise<boolean>;
  reissue: (shareLinkId: string, label: string, hours: number) => Promise<boolean>;
  dismissResult: () => void;
};

/**
 * Preparación previa con lo que ya está cargado: los productos sueltos se
 * cuentan solo si tienen ficha publicada; un capítulo de tipo categoría se
 * da por no vacío (se expande al generar, y el RPC valida el resultado).
 */
export function previewReadiness(detail: PrivateCatalogDetail | null, products: ProductLookup): CatalogReadiness {
  if (!detail) return evaluateCatalogReadiness([]);
  return evaluateCatalogReadiness(
    detail.sections.map((section) => ({
      title: section.title,
      productCount: section.items.filter((item) => item.itemType === 'category' || products.has(item.referenceId)).length,
    }))
  );
}

export function useShareLinkFlow(
  detail: PrivateCatalogDetail | null,
  products: ProductLookup,
  reload: () => Promise<void>
): ShareLinkFlowState {
  const [creating, setCreating] = useState(false);
  const [progress, setProgress] = useState<SnapshotProgress | null>(null);
  const [reissuingId, setReissuingId] = useState<string | null>(null);
  const [errors, setErrors] = useState<ShareLinkErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<ShareLinkResult | null>(null);

  const readiness = useMemo(() => previewReadiness(detail, products), [detail, products]);
  const siteConfigured = catalogSiteUrl() !== null;

  const create = useCallback(
    async ({ label, hours }: { label: string; hours: number }) => {
      if (!detail) return false;
      const validation = validateShareLinkInput({ label, hours });
      setErrors(validation);
      if (hasErrors(validation)) return false;

      setCreating(true);
      setSubmitError(null);
      setProgress(null);
      try {
        const snapshot = await buildCatalogSnapshot(detail, setProgress);
        const token = await generateShareToken();
        const expiresAt = expiresAtFromHours(hours);
        const created = await createCatalogShareLink({
          catalogId: detail.id,
          snapshot,
          token: token.token,
          tokenHash: token.tokenHash,
          tokenHint: token.tokenHint,
          label,
          expiresAt,
        });
        setResult({ url: buildMagazineUrl(token.token), label: label.trim(), expiresAt: created.expiresAt, reissued: false });
        await reload();
        return true;
      } catch (caught) {
        setSubmitError(errorMessage(caught, 'No fue posible crear el enlace.'));
        return false;
      } finally {
        setCreating(false);
        setProgress(null);
      }
    },
    [detail, reload]
  );

  const reissue = useCallback(
    async (shareLinkId: string, label: string, hours: number) => {
      const validation = validateShareLinkInput({ label, hours });
      if (validation.hours) {
        setSubmitError(validation.hours);
        return false;
      }
      setReissuingId(shareLinkId);
      setSubmitError(null);
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
        await reload();
        return true;
      } catch (caught) {
        setSubmitError(errorMessage(caught, 'No fue posible reemitir el enlace.'));
        return false;
      } finally {
        setReissuingId(null);
      }
    },
    [reload]
  );

  const dismissResult = useCallback(() => setResult(null), []);

  return { readiness, siteConfigured, creating, progress, reissuingId, errors, submitError, result, create, reissue, dismissResult };
}
