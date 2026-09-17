import { useCallback, useMemo, useState } from 'react';
import { errorMessage } from '@/lib/errorMessage';
import { evaluateCatalogReadiness, type CatalogReadiness } from '@/lib/catalogos/readiness';
import { summarizeSectionProducts } from '@/lib/catalogos/sectionCounts';
import { collectSelectionIds } from '@/lib/catalogos/snapshot';
import { buildMagazineUrl, catalogSiteUrl, expiresAtFromHours } from '@/lib/catalogos/shareLinks';
import type { PrivateCatalogDetail } from '@/lib/catalogos/types';
import { hasErrors, validateShareLinkInput, type ShareLinkErrors } from '@/lib/catalogos/validators';
import { waitForModalDismissal } from '../../utils/modalTransition';
import { shareLinkByWhatsApp, type WhatsAppOutcome } from '../../utils/shareActions';
import { buildShareMessage } from '../../utils/shareMessages';
import { createCatalogShareLink, reissueCatalogShareLink } from '../services/catalogShareLinksService';
import { buildCatalogSnapshot, type KnownListing, type SnapshotProgress } from '../services/catalogSnapshotService';
import { getPrivateCatalog } from '../services/catalogsService';
import { generateShareToken } from '../services/shareTokenService';
import { invalidateCatalogCache } from '../store/catalogosStore';
import type { CategoryPreviewLookup, ProductLookup } from './useCatalogDetail';

export type ShareLinkResult = {
  url: string;
  label: string;
  expiresAt: string;
  /** `true` cuando viene de «Reemitir». */
  reissued: boolean;
  /** Cómo se intentó enviar por WhatsApp al generarlo; `null` si no se intentó. */
  whatsApp: WhatsAppOutcome | null;
};

/**
 * `whatsapp`: al terminar abre WhatsApp con el mensaje; `none`: no lo abre.
 * En los dos casos queda la hoja con el enlace para copiarlo o abrirlo.
 */
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
  /**
   * `onSuccess` corre en cuanto el servidor confirma, ANTES de mostrar el
   * resultado: ahí se cierra la hoja de Reemitir (iOS no apila modales).
   */
  reissue: (shareLinkId: string, label: string, hours: number, options?: { onSuccess?: () => void }) => Promise<boolean>;
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

/** Solo lo cargado que sigue en la selección actual se reutiliza en el snapshot. */
function knownForSelection(detail: PrivateCatalogDetail, products: ProductLookup, categories: CategoryPreviewLookup): KnownListing {
  const { productIds, categoryIds } = collectSelectionIds(detail.sections);
  return {
    products: new Map(productIds.flatMap((productId) => {
      const product = products.get(productId);
      return product ? [[productId, product] as const] : [];
    })),
    categories: new Map(categoryIds.flatMap((categoryId) => {
      const preview = categories.get(categoryId);
      return preview ? [[categoryId, preview] as const] : [];
    })),
  };
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
  const catalogId = detail?.id ?? null;

  const refreshAfterMutation = useCallback(async () => {
    if (!catalogId) return;
    invalidateCatalogCache(catalogId);
    await reload();
  }, [catalogId, reload]);

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
        // La caché puede ser de antes de un cambio (otra pantalla, otro
        // dispositivo): la edición se congela con la selección de ahora.
        const fresh = await getPrivateCatalog(detail.id);
        if (!fresh) throw new Error('El catálogo ya no está disponible. Puede que se haya archivado.');
        // Los productos sueltos y las categorías pequeñas ya cargadas no se vuelven a pedir.
        const snapshot = await buildCatalogSnapshot(fresh, { known: knownForSelection(fresh, products, categories), onProgress: setProgress });
        const token = await generateShareToken();
        const created = await createCatalogShareLink({
          catalogId: fresh.id,
          snapshot,
          token: token.token,
          tokenHash: token.tokenHash,
          tokenHint: token.tokenHint,
          label,
          expiresAt: expiresAtFromHours(hours),
        });
        const url = buildMagazineUrl(token.token);
        const trimmedLabel = label.trim();
        const whatsApp = delivery === 'whatsapp' ? await shareLinkByWhatsApp(buildShareMessage({ url, label: trimmedLabel })) : null;
        // Siempre queda el enlace a mano: abrir WhatsApp no garantiza que se haya enviado.
        setResult({ url, label: trimmedLabel, expiresAt: created.expiresAt, reissued: false, whatsApp });
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
    async (shareLinkId: string, label: string, hours: number, { onSuccess }: { onSuccess?: () => void } = {}) => {
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
        const next: ShareLinkResult = { url: buildMagazineUrl(token.token), label, expiresAt: reissued.expiresAt, reissued: true, whatsApp: null };
        // Primero se cierra la hoja de Reemitir y se espera a que se retire:
        // en iOS el resultado no se mostraría sobre ella.
        onSuccess?.();
        await waitForModalDismissal();
        setResult(next);
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
