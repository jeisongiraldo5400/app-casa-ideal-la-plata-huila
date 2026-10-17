import { CASA_IDEAL_LOGO_DATA_URI } from '@/lib/casaIdealLogo';
import { COMPANY } from '@/lib/negocioContractHtml';
import { formatNegocioCodigo, labelNegocioStatus } from '@/lib/negocioLabels';
import { formatPaymentDateTime } from '@/lib/localDate';
import { isReprint, printCopyDetail, printCopyLabel, type PrintCopyInfo } from '@/lib/printCopy';

// --- cuerpo compartido ---
// Desde aquí el archivo es idéntico en frontend/src/lib/deliveryOrderPrintHtml.ts
// y app-casa-ideal/lib/deliveryOrderPrintHtml.ts (lo verifica una prueba de
// paridad de la web). Solo cambian los imports de arriba.

/**
 * Documento impreso de una orden de entrega o remisión (propuesta, sección 5).
 * Los datos salen de `get_delivery_order_print_data` (20261231580000) y el
 * número de copia de `register_delivery_order_print`. Hoja carta en la web y
 * PDF carta en el móvil. Sin precios: es un documento de logística.
 */

export type DeliveryOrderPrintLine = {
  productName: string;
  sku: string | null;
  warehouseName: string | null;
  quantity: number;
  delivered: number;
  returned: number;
  pending: number;
  notes: string | null;
  /** Seriales entregados (vigentes); vacío si no hay o si quien imprime no los puede ver. */
  serials: string[];
};

export type DeliveryOrderPrintCustomer = {
  name: string;
  idNumber: string | null;
  phone: string | null;
  phoneSecondary: string | null;
  address: string | null;
  neighborhood: string | null;
  vereda: string | null;
  municipio: string | null;
};

export type DeliveryOrderPrintNegocio = {
  numero: number;
  /** false: quien imprime no ve el negocio; solo sale el número. */
  visible: boolean;
  status: string | null;
  sellerName: string | null;
  dealDate: string | null;
};

export type DeliveryOrderPrintBlock = {
  id: string;
  orderNumber: string;
  orderType: "customer" | "remission";
  status: string;
  createdAt: string | null;
  notes: string | null;
  /** Destino escrito en la orden (en una remisión, la ruta). */
  deliveryAddress: string | null;
  createdByName: string | null;
  /** Transportador (remisión). */
  assignedToName: string | null;
  zoneName: string | null;
  pickupNames: string[];
  /** Remisión en la que viaja una OE de cliente. */
  remission: { orderNumber: string; transporterName: string | null } | null;
  customer: DeliveryOrderPrintCustomer | null;
  negocios: DeliveryOrderPrintNegocio[];
  serialsVisible: boolean;
  items: DeliveryOrderPrintLine[];
};

export type DeliveryOrderPrintData = DeliveryOrderPrintBlock & {
  /** OE de cliente que viajan en la remisión (vacío en una OE de cliente). */
  children: DeliveryOrderPrintBlock[];
  prints: { count: number; lastPrintedAt: string | null; lastPrintedBy: string | null };
  generatedAt: string;
};

/** 'completa': todo el documento. 'hoja_cliente': una hoja por cada OE de cliente de la remisión. */
export type DeliveryOrderPrintLayout = "completa" | "hoja_cliente";

export type DeliveryOrderPrintOptions = {
  layout?: DeliveryOrderPrintLayout;
  /** Copia del documento completo. */
  copy?: PrintCopyInfo | null;
  /** Copia de cada hoja por cliente, por id de la OE. */
  copiesByOrderId?: Record<string, PrintCopyInfo>;
  /** Instante de la impresión (ISO); por defecto el de la copia o el de los datos. */
  printedAt?: string | null;
};

// ---------------------------------------------------------------------------
// Lectura de la respuesta del RPC (snake_case) a tipos de la app
// ---------------------------------------------------------------------------

type Raw = Record<string, unknown>;
const asRecord = (value: unknown): Raw | null =>
  typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Raw) : null;
const text = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  const result = String(value).trim();
  return result ? result : null;
};
const num = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

function parseLine(raw: unknown): DeliveryOrderPrintLine | null {
  const row = asRecord(raw);
  if (!row) return null;
  const quantity = num(row.quantity);
  const delivered = num(row.delivered_quantity);
  const returned = num(row.returned_quantity);
  const pending =
    row.pending_quantity === undefined || row.pending_quantity === null
      ? Math.max(quantity - delivered - returned, 0)
      : num(row.pending_quantity);
  return {
    productName: text(row.product_name) ?? "Producto",
    sku: text(row.sku),
    warehouseName: text(row.warehouse_name),
    quantity,
    delivered,
    returned,
    pending,
    notes: text(row.notes),
    serials: list(row.serials).map(text).filter((serial): serial is string => Boolean(serial)),
  };
}

function parseCustomer(raw: unknown): DeliveryOrderPrintCustomer | null {
  const row = asRecord(raw);
  if (!row) return null;
  return {
    name: text(row.name) ?? "Cliente",
    idNumber: text(row.id_number),
    phone: text(row.phone),
    phoneSecondary: text(row.phone_secondary),
    address: text(row.address),
    neighborhood: text(row.neighborhood),
    vereda: text(row.vereda),
    municipio: text(row.municipio),
  };
}

function parseNegocio(raw: unknown): DeliveryOrderPrintNegocio | null {
  const row = asRecord(raw);
  if (!row || row.numero === null || row.numero === undefined) return null;
  return {
    numero: num(row.numero),
    visible: row.visible === true,
    status: text(row.status),
    sellerName: text(row.seller_name),
    dealDate: text(row.deal_date),
  };
}

function parseBlock(raw: unknown): DeliveryOrderPrintBlock | null {
  const row = asRecord(raw);
  if (!row || !text(row.id)) return null;
  const remission = asRecord(row.remission);
  return {
    id: String(row.id),
    orderNumber: text(row.order_number) ?? String(row.id).slice(0, 8),
    orderType: row.order_type === "remission" ? "remission" : "customer",
    status: text(row.status) ?? "pending",
    createdAt: text(row.created_at),
    notes: text(row.notes),
    deliveryAddress: text(row.delivery_address),
    createdByName: text(row.created_by_name),
    assignedToName: text(row.assigned_to_name),
    zoneName: text(row.zone_name),
    pickupNames: list(row.pickup_names).map(text).filter((name): name is string => Boolean(name)),
    remission:
      remission && text(remission.order_number)
        ? { orderNumber: String(remission.order_number), transporterName: text(remission.transporter_name) }
        : null,
    customer: parseCustomer(row.customer),
    negocios: list(row.negocios).map(parseNegocio).filter((n): n is DeliveryOrderPrintNegocio => Boolean(n)),
    serialsVisible: row.serials_visible === true,
    items: list(row.items).map(parseLine).filter((line): line is DeliveryOrderPrintLine => Boolean(line)),
  };
}

/** Respuesta de `get_delivery_order_print_data`; lanza si no trae una orden. */
export function parseDeliveryOrderPrintData(raw: unknown): DeliveryOrderPrintData {
  const block = parseBlock(raw);
  if (!block) throw new Error("El servidor no devolvió los datos de la orden");
  const row = raw as Raw;
  const prints = asRecord(row.prints);
  return {
    ...block,
    children: list(row.children).map(parseBlock).filter((child): child is DeliveryOrderPrintBlock => Boolean(child)),
    prints: {
      count: num(prints?.count),
      lastPrintedAt: text(prints?.last_printed_at),
      lastPrintedBy: text(prints?.last_printed_by),
    },
    generatedAt: text(row.generated_at) ?? new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Reglas del papel
// ---------------------------------------------------------------------------

export const DELIVERY_ORDER_PRINT_STATUS_LABEL: Record<string, string> = {
  pending: "Pendiente",
  approved: "Aprobada",
  sent_by_remission: "Enviada por remisión",
  delivered: "Entregada",
  cancelled: "Anulada",
  returned: "Devolución total",
};

export function isCancelledOrder(status: string | null | undefined) {
  return status === "cancelled";
}

/** «Orden de entrega» o «Remisión». */
export function deliveryOrderDocumentTitle(orderType: DeliveryOrderPrintBlock["orderType"]) {
  return orderType === "remission" ? "Remisión" : "Orden de entrega";
}

/** OE de cliente de la remisión que llevan hoja propia (las anuladas no se entregan). */
export function clientSheetBlocks(data: Pick<DeliveryOrderPrintData, "children">) {
  return data.children.filter((child) => !isCancelledOrder(child.status));
}

export type DeliveryOrderPrintTotals = { quantity: number; delivered: number; returned: number; pending: number };

export function deliveryOrderPrintTotals(items: readonly DeliveryOrderPrintLine[]): DeliveryOrderPrintTotals {
  return items.reduce(
    (sum, item) => ({
      quantity: sum.quantity + item.quantity,
      delivered: sum.delivered + item.delivered,
      returned: sum.returned + item.returned,
      pending: sum.pending + item.pending,
    }),
    { quantity: 0, delivered: 0, returned: 0, pending: 0 }
  );
}

/** Negocios del documento sin repetir: los de la orden y, en una remisión, los de sus clientes. */
export function relatedNegocios(data: Pick<DeliveryOrderPrintData, "negocios" | "children">) {
  const seen = new Map<number, DeliveryOrderPrintNegocio>();
  for (const negocio of [...data.negocios, ...data.children.flatMap((child) => child.negocios)]) {
    const known = seen.get(negocio.numero);
    if (!known || (!known.visible && negocio.visible)) seen.set(negocio.numero, negocio);
  }
  return Array.from(seen.values()).sort((a, b) => a.numero - b.numero);
}

/** Nombre del PDF sin la extensión: «Remision OE-2026-0071» o «Orden de entrega OE-2026-1234 - Cliente». */
export function deliveryOrderPrintFileLabel(data: DeliveryOrderPrintData, layout: DeliveryOrderPrintLayout = "completa") {
  const head = `${data.orderType === "remission" ? "Remision" : "Orden de entrega"} ${data.orderNumber}`;
  if (layout === "hoja_cliente") return `${head} - hojas por cliente`;
  return data.customer?.name ? `${head} - ${data.customer.name}` : head;
}

const esc = (value: string | number | null | undefined): string =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const qty = (value: number) => (Number.isInteger(value) ? String(value) : value.toFixed(2));

/** `value` ya viene escapado; vacío = «—». */
const field = (label: string, value: string, wide = false) =>
  `<div class="field${wide ? " wide" : ""}"><span>${label}</span><strong>${value || "—"}</strong></div>`;

function statusChip(status: string) {
  const label = DELIVERY_ORDER_PRINT_STATUS_LABEL[status] ?? status;
  const tone = isCancelledOrder(status) ? "void" : status === "delivered" ? "ok" : "pending";
  return `<span class="status status-${tone}">${esc(label)}</span>`;
}

function copyBanner(copy: PrintCopyInfo | null | undefined) {
  if (!isReprint(copy)) return "";
  return `<p class="copy-banner"><b>${esc(printCopyLabel(copy))}</b> · ${esc(printCopyDetail(copy))}</p>`;
}

function voidBanner(block: DeliveryOrderPrintBlock) {
  if (!isCancelledOrder(block.status)) return "";
  return `<p class="void-banner">${block.orderType === "remission" ? "REMISIÓN ANULADA" : "ORDEN ANULADA"} · No se debe entregar con este documento.</p>`;
}

function customerSection(customer: DeliveryOrderPrintCustomer | null) {
  if (!customer) return "";
  const phones = [customer.phone, customer.phoneSecondary].filter(Boolean).map(esc).join(" · ");
  const address = [customer.address, customer.neighborhood].filter(Boolean).map(esc).join(" · ");
  return `<section class="block"><h2>Cliente</h2><div class="fields">
  ${field("Nombre", esc(customer.name), true)}
  ${field("Cédula", esc(customer.idNumber))}
  ${field("Teléfonos", phones)}
  ${field("Dirección", address, true)}
  ${field("Vereda", esc(customer.vereda))}
  ${field("Municipio", esc(customer.municipio))}
</div></section>`;
}

function negociosSection(negocios: DeliveryOrderPrintNegocio[], title: string) {
  if (negocios.length === 0) return "";
  const rows = negocios
    .map((negocio) =>
      negocio.visible
        ? `<tr><td><b>${esc(formatNegocioCodigo(negocio.numero))}</b></td><td>${esc(labelNegocioStatus(negocio.status ?? ""))}</td><td>${esc(negocio.sellerName) || "—"}</td><td>${esc(formatPaymentDateTime(negocio.dealDate))}</td></tr>`
        : `<tr><td><b>${esc(formatNegocioCodigo(negocio.numero))}</b></td><td colspan="3" class="muted">Sin acceso al detalle del negocio</td></tr>`
    )
    .join("");
  return `<section class="block"><h2>${esc(title)}</h2><table class="grid compact"><thead><tr><th>Número</th><th>Estado</th><th>Vendedor</th><th>Fecha</th></tr></thead><tbody>${rows}</tbody></table></section>`;
}

function logisticsSection(block: DeliveryOrderPrintBlock) {
  const pickup = block.pickupNames.map(esc).join(", ");
  const parts =
    block.orderType === "remission"
      ? [
          field("Transportador", esc(block.assignedToName)),
          field("Zona", esc(block.zoneName)),
          field("Destino", esc(block.deliveryAddress)),
          field("Creada por", esc(block.createdByName)),
          field("Quién recoge", pickup, true),
        ]
      : [
          field(
            "Responsable / transportador",
            block.remission
              ? `${esc(block.remission.transporterName) || "—"} <small>(remisión ${esc(block.remission.orderNumber)})</small>`
              : ""
          ),
          field("Quién recoge", pickup),
          field("Creada por", esc(block.createdByName)),
        ];
  return `<section class="block"><h2>Logística</h2><div class="fields">${parts.join("")}</div></section>`;
}

/** La referencia solo si dice algo distinto del nombre (muchas son el mismo texto). */
const comparable = (value: string | null) => String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
const showSku = (item: DeliveryOrderPrintLine) => Boolean(item.sku) && comparable(item.sku) !== comparable(item.productName);

function itemsTable(block: DeliveryOrderPrintBlock, title: string) {
  if (block.items.length === 0) {
    return `<section class="block"><h2>${esc(title)}</h2><p class="muted">Sin productos.</p></section>`;
  }
  const rows = block.items
    .map((item) => {
      const details = [
        showSku(item) ? `<div class="sub">Ref. ${esc(item.sku)}</div>` : "",
        item.notes ? `<div class="sub note">Nota: ${esc(item.notes)}</div>` : "",
        item.serials.length ? `<div class="sub serials">Seriales: ${item.serials.map(esc).join(", ")}</div>` : "",
      ].join("");
      return `<tr><td class="product"><b>${esc(item.productName)}</b>${details}</td><td>${esc(item.warehouseName) || "—"}</td><td class="n">${qty(item.quantity)}</td><td class="n">${qty(item.delivered)}</td><td class="n">${qty(item.returned)}</td><td class="n pend">${qty(item.pending)}</td></tr>`;
    })
    .join("");
  const totals = deliveryOrderPrintTotals(block.items);
  const totalUnits = `<tr class="totals"><td colspan="2">Total (${block.items.length} ${block.items.length === 1 ? "producto" : "productos"})</td><td class="n">${qty(totals.quantity)}</td><td class="n">${qty(totals.delivered)}</td><td class="n">${qty(totals.returned)}</td><td class="n pend">${qty(totals.pending)}</td></tr>`;
  return `<section class="block"><h2>${esc(title)}</h2><table class="grid items"><thead><tr><th>Producto</th><th>Bodega</th><th class="n">Pedidas</th><th class="n">Entregadas</th><th class="n">Devueltas</th><th class="n">Pendientes</th></tr></thead><tbody>${rows}</tbody><tfoot>${totalUnits}</tfoot></table></section>`;
}

function notesSection(notes: string | null) {
  return `<section class="block observations"><h2>Observaciones</h2><div class="obs-box">${notes ? esc(notes) : ""}</div></section>`;
}

function signatures(labels: string[]) {
  const box = (label: string) =>
    `<div class="sign"><div class="sign-line"></div><b>${esc(label)}</b><span>Nombre:</span><span>C.C.:</span><span>Fecha:</span></div>`;
  return `<section class="signatures cols-${labels.length}">${labels.map(box).join("")}</section>`;
}

function header(block: DeliveryOrderPrintBlock, eyebrow: string, printedAt: string) {
  return `<header class="brand">
  <img class="logo" src="${CASA_IDEAL_LOGO_DATA_URI}" alt="${esc(COMPANY.name)} - ${esc(COMPANY.tagline)}" />
  <div class="brand-side">
    <div class="company"><b>NIT ${esc(COMPANY.nit)}</b> · ${esc(COMPANY.owner)}<br />${esc(COMPANY.address)} · Cel. ${esc(COMPANY.phone)}</div>
    <div class="title"><div><div class="eyebrow">${esc(eyebrow)}</div><h1>${esc(block.orderNumber)}</h1></div>${statusChip(block.status)}</div>
    <div class="dates"><span>Creada: <b>${esc(formatPaymentDateTime(block.createdAt))}</b></span><span>Impresa: <b>${esc(formatPaymentDateTime(printedAt))}</b></span></div>
  </div>
</header>`;
}

function watermark(cancelled: boolean, copy: PrintCopyInfo | null | undefined) {
  if (cancelled) return '<div class="watermark" aria-hidden="true">ANULADA</div>';
  if (isReprint(copy)) return '<div class="watermark" aria-hidden="true">COPIA</div>';
  return "";
}

/** Página de una OE de cliente (sola, o como hoja de su remisión). */
function customerOrderPage(
  block: DeliveryOrderPrintBlock,
  copy: PrintCopyInfo | null | undefined,
  printedAt: string,
  eyebrow = deliveryOrderDocumentTitle("customer")
) {
  const cancelled = isCancelledOrder(block.status);
  return `<main class="sheet${cancelled ? " is-voided" : ""}">
${watermark(cancelled, copy)}
${header(block, eyebrow, printedAt)}
${voidBanner(block)}${copyBanner(copy)}
${customerSection(block.customer)}
${negociosSection(block.negocios, "Negocio")}
${logisticsSection(block)}
${itemsTable(block, "Productos")}
${notesSection(block.notes)}
${signatures(["Entregó", "Transportador", "Recibí conforme"])}
${footer(block)}
</main>`;
}

/** Bloque de un cliente dentro de la remisión completa. */
function remissionClientBlock(child: DeliveryOrderPrintBlock, index: number) {
  const cancelled = isCancelledOrder(child.status);
  const customer = child.customer;
  const phones = customer ? [customer.phone, customer.phoneSecondary].filter(Boolean).map(esc).join(" · ") : "";
  const place = customer ? [customer.address, customer.neighborhood, customer.vereda, customer.municipio].filter(Boolean).map(esc).join(" · ") : "";
  const negocios = child.negocios
    .map((n) => (n.visible ? `${esc(formatNegocioCodigo(n.numero))} (${esc(labelNegocioStatus(n.status ?? ""))}${n.sellerName ? ` · ${esc(n.sellerName)}` : ""})` : esc(formatNegocioCodigo(n.numero))))
    .join(", ");
  return `<section class="client${cancelled ? " is-voided-block" : ""}">
<div class="client-head"><span class="client-index">${index + 1}</span><div class="client-title"><b>${esc(customer?.name ?? "Cliente")}</b> · ${esc(child.orderNumber)}</div>${statusChip(child.status)}</div>
${cancelled ? '<p class="void-banner small">ORDEN ANULADA · No se entrega.</p>' : ""}
<div class="fields">
  ${field("Cédula", esc(customer?.idNumber))}
  ${field("Teléfonos", phones)}
  ${field("Dirección, vereda y municipio", place, true)}
  ${field("Negocio", negocios)}
  ${field("Quién recoge", child.pickupNames.map(esc).join(", "))}
</div>
${itemsTable(child, "Productos")}
${child.notes ? `<p class="client-notes"><b>Observaciones:</b> ${esc(child.notes)}</p>` : ""}
${cancelled ? "" : signatures(["Recibí conforme"])}
</section>`;
}

function footer(block: DeliveryOrderPrintBlock) {
  return `<footer class="foot">${esc(COMPANY.name)} · ${esc(deliveryOrderDocumentTitle(block.orderType))} ${esc(block.orderNumber)} · Documento generado por el Sistema de Gestión de Inventario.${
    block.serialsVisible ? "" : " Los seriales solo se imprimen para quien despacha o administra la orden."
  }</footer>`;
}

function remissionPage(data: DeliveryOrderPrintData, copy: PrintCopyInfo | null | undefined, printedAt: string) {
  const cancelled = isCancelledOrder(data.status);
  const clients = data.children;
  const ownTitle = clients.length ? "Productos propios de la remisión" : "Productos";
  return `<main class="sheet${cancelled ? " is-voided" : ""}">
${watermark(cancelled, copy)}
${header(data, deliveryOrderDocumentTitle("remission"), printedAt)}
${voidBanner(data)}${copyBanner(copy)}
${logisticsSection(data)}
${negociosSection(relatedNegocios(data), "Negocios relacionados")}
${data.items.length || !clients.length ? itemsTable(data, ownTitle) : ""}
${clients.length ? `<section class="block"><h2>Entregas a clientes (${clients.length})</h2>${clients.map(remissionClientBlock).join("")}</section>` : ""}
${notesSection(data.notes)}
${signatures(["Entregó", "Transportador"])}
${footer(data)}
</main>`;
}

const PRINT_CSS = `
@page { size: letter; margin: 10mm 11mm; }
* { box-sizing: border-box; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { margin: 0; padding: 20px 12px; background: #eef2f7; font-family: Arial, Helvetica, sans-serif; color: #17243b; font-size: 11px; line-height: 1.35; }
.sheet { position: relative; overflow: hidden; max-width: 800px; margin: 0 auto 20px; background: #fff; border: 1px solid #d5dfeb; border-top: 6px solid #195ba6; border-radius: 10px; padding: 16px 20px 12px; }
.brand { display: flex; align-items: center; gap: 16px; padding-bottom: 8px; border-bottom: 1px solid #e3eaf3; }
.logo { display: block; width: 210px; max-width: 38%; height: auto; object-fit: contain; }
.brand-side { flex: 1; min-width: 0; }
.company { color: #294c77; font-size: 10px; line-height: 1.4; }
.title { display: flex; justify-content: space-between; align-items: flex-end; gap: 10px; margin-top: 4px; }
.eyebrow { color: #5f6b7a; font-size: 10px; font-weight: 700; letter-spacing: 1.2px; text-transform: uppercase; }
.title h1 { margin: 1px 0 0; color: #173b67; font-size: 20px; letter-spacing: 0.3px; overflow-wrap: anywhere; }
.dates { display: flex; flex-wrap: wrap; gap: 2px 14px; margin-top: 3px; color: #5f6b7a; font-size: 10px; }
.dates b { color: #17243b; }
.status { padding: 3px 10px; border-radius: 999px; font-size: 10px; font-weight: 700; letter-spacing: 0.6px; text-transform: uppercase; white-space: nowrap; }
.status-ok { background: #e7f6ec; color: #1d7a3e; border: 1px solid #b9e3c7; }
.status-void { background: #fdecea; color: #b42318; border: 1px solid #f5c2bd; }
.status-pending { background: #fff4e5; color: #9a5b00; border: 1px solid #f3d19e; }
.void-banner { margin: 8px 0 0; padding: 6px 10px; border-radius: 6px; background: #fdecea; color: #b42318; font-weight: 700; text-align: center; }
.void-banner.small { margin: 4px 0; padding: 3px 8px; font-size: 10px; }
.copy-banner { margin: 8px 0 0; padding: 5px 10px; border: 1px dashed #a13c2f; border-radius: 6px; color: #a13c2f; font-size: 11px; text-align: center; }
.copy-banner b { letter-spacing: 1px; }
.block { margin-top: 10px; }
.block h2 { margin: 0 0 4px; padding-bottom: 2px; border-bottom: 2px solid #195ba6; color: #173b67; font-size: 11px; letter-spacing: 0.8px; text-transform: uppercase; }
.fields { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0 14px; }
.field { min-width: 0; padding: 3px 0; border-bottom: 1px dashed #d5dfeb; }
.field.wide { grid-column: span 2; }
.field span { display: block; color: #5f6b7a; font-size: 8.5px; font-weight: 700; letter-spacing: 0.5px; text-transform: uppercase; }
.field strong { display: block; color: #17243b; font-size: 11px; overflow-wrap: anywhere; }
.field small { color: #5f6b7a; font-weight: 400; }
table.grid { width: 100%; border-collapse: collapse; }
table.grid th { padding: 4px 5px; background: #eef3fa; color: #294c77; font-size: 9px; letter-spacing: 0.4px; text-align: left; text-transform: uppercase; border-bottom: 1px solid #c9d6e6; }
table.grid td { padding: 4px 5px; border-bottom: 1px solid #e3eaf3; vertical-align: top; overflow-wrap: anywhere; }
table.grid tr { break-inside: avoid; page-break-inside: avoid; }
table.grid .n { width: 62px; text-align: right; white-space: nowrap; }
table.grid td.pend { font-weight: 700; color: #173b67; }
table.grid tfoot td { border-top: 2px solid #c9d6e6; border-bottom: none; font-weight: 700; background: #f6f9fd; }
table.items td:nth-child(2) { width: 120px; }
.product .sub { margin-top: 1px; color: #5f6b7a; font-size: 9.5px; }
.product .note { color: #7a4b00; font-style: italic; }
.product .serials { color: #17243b; font-family: "Courier New", monospace; }
.muted { color: #5f6b7a; }
.client { margin-top: 8px; padding: 8px 10px; border: 1px solid #c9d6e6; border-radius: 8px; break-inside: avoid; page-break-inside: avoid; }
.client .block { margin-top: 6px; }
.client .block h2 { border-bottom-width: 1px; font-size: 9.5px; }
.client-head { display: flex; align-items: center; gap: 8px; }
.client-index { display: inline-flex; align-items: center; justify-content: center; width: 20px; height: 20px; border-radius: 50%; background: #195ba6; color: #fff; font-size: 10px; font-weight: 700; }
.client-title { flex: 1; min-width: 0; font-size: 12px; color: #173b67; }
.client-notes { margin: 4px 0 0; font-size: 10px; }
.is-voided-block { opacity: 0.75; border-style: dashed; }
.client .signatures.cols-1 { grid-template-columns: 1fr; margin-top: 8px; }
.client .sign { display: grid; grid-template-columns: 1.3fr 1.3fr 1fr 0.8fr; grid-template-rows: auto auto; align-items: end; gap: 0 10px; }
.client .sign-line { grid-column: 1; grid-row: 1; height: 24px; }
.client .sign b { grid-column: 1; grid-row: 2; white-space: nowrap; }
.client .sign span { grid-row: 1; height: 24px; display: flex; align-items: flex-end; }
.obs-box { min-height: 34px; padding: 5px 7px; border: 1px solid #d5dfeb; border-radius: 6px; white-space: pre-wrap; }
.signatures { display: grid; gap: 18px; margin-top: 26px; break-inside: avoid; page-break-inside: avoid; }
.signatures.cols-1 { grid-template-columns: minmax(0, 260px); margin-top: 18px; }
.signatures.cols-2 { grid-template-columns: repeat(2, 1fr); }
.signatures.cols-3 { grid-template-columns: repeat(3, 1fr); }
.sign { display: flex; flex-direction: column; gap: 5px; font-size: 10px; }
.sign-line { height: 26px; border-bottom: 1px solid #17243b; }
.sign b { color: #173b67; font-size: 10.5px; }
.sign span { padding-bottom: 2px; border-bottom: 1px dotted #9aa8b8; color: #5f6b7a; }
.foot { margin-top: 12px; padding-top: 6px; border-top: 1px solid #e3eaf3; color: #5f6b7a; font-size: 9px; text-align: center; }
.watermark { position: absolute; top: 38%; left: 50%; transform: translate(-50%, -50%) rotate(-24deg); color: rgba(180, 35, 24, 0.1); font-size: 120px; font-weight: 800; letter-spacing: 10px; white-space: nowrap; pointer-events: none; z-index: 0; }
.page-break { break-after: page; page-break-after: always; }
@media (max-width: 560px) {
  body { padding: 8px 4px; }
  .sheet { padding: 12px 10px; }
  .brand { flex-direction: column; align-items: stretch; }
  .logo { max-width: 70%; margin: 0 auto; }
  .fields { grid-template-columns: repeat(2, 1fr); }
  .signatures.cols-3, .signatures.cols-2 { grid-template-columns: 1fr; }
}
@media print {
  body { padding: 0; background: #fff; }
  .sheet { max-width: none; margin: 0; border: none; border-radius: 0; padding: 0; }
  .watermark { color: rgba(0, 0, 0, 0.07); }
}
`;

/**
 * HTML del documento. `hoja_cliente` (solo remisiones con clientes) imprime una
 * página por cada OE de cliente no anulada, con su propio número de copia,
 * para que el transportador le entregue a cada uno la suya.
 */
export function buildDeliveryOrderPrintHtml(data: DeliveryOrderPrintData, options: DeliveryOrderPrintOptions = {}) {
  const layout: DeliveryOrderPrintLayout =
    options.layout === "hoja_cliente" && data.orderType === "remission" && clientSheetBlocks(data).length > 0
      ? "hoja_cliente"
      : "completa";
  const printedAt = options.printedAt || options.copy?.printedAt || data.generatedAt;
  let pages: string;
  if (layout === "hoja_cliente") {
    const sheets = clientSheetBlocks(data);
    pages = sheets
      .map((child, index) => {
        const block: DeliveryOrderPrintBlock = {
          ...child,
          remission: { orderNumber: data.orderNumber, transporterName: data.assignedToName },
        };
        const page = customerOrderPage(
          block,
          options.copiesByOrderId?.[child.id] ?? null,
          printedAt,
          `Orden de entrega · Remisión ${data.orderNumber}`
        );
        return index < sheets.length - 1 ? `${page}<div class="page-break"></div>` : page;
      })
      .join("\n");
  } else if (data.orderType === "remission") {
    pages = remissionPage(data, options.copy, printedAt);
  } else {
    pages = customerOrderPage(data, options.copy, printedAt);
  }
  const title = `${deliveryOrderDocumentTitle(data.orderType)} ${data.orderNumber}`;
  return `<!doctype html><html lang="es"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(title)}</title><style>${PRINT_CSS}</style></head><body>
${pages}
</body></html>`;
}
