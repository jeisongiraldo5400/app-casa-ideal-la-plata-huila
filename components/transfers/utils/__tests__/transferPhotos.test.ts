import { parseTransferDetail } from '../transferModel';
import {
  droppedUploadedPhotos,
  eventPhotos,
  optionalPhotoPath,
  transferPhotoPath,
  validateTransferPhoto,
  withDamagedPhotoPaths,
} from '../transferPhotos';
import { rawDetail } from '../../__fixtures__/transferFixtures';

const photo = (id: string, mimeType = 'image/jpeg') => ({ id, uri: `file:///${id}`, mimeType, size: 1000, uploaded: false });

describe('transferPhotos', () => {
  it('la ruta va en la carpeta del traslado con la extensión del tipo', () => {
    expect(transferPhotoPath('t-1', photo('abc'))).toBe('t-1/abc.jpg');
    expect(transferPhotoPath('t-1', photo('abc', 'image/png'))).toBe('t-1/abc.png');
    expect(transferPhotoPath('t-1', photo('abc', 'image/webp'))).toBe('t-1/abc.webp');
    expect(optionalPhotoPath('t-1', null)).toBeNull();
    expect(() => transferPhotoPath('t-1', photo('abc', 'image/heic'))).toThrow();
  });

  it('valida tipo y tamaño como el bucket', () => {
    expect(validateTransferPhoto({ mimeType: 'image/heic', size: 10 })).toMatch(/JPG, PNG o WebP/);
    expect(validateTransferPhoto({ mimeType: 'image/jpeg', size: 6 * 1024 * 1024 })).toMatch(/5 MB/);
    expect(validateTransferPhoto({ mimeType: 'image/jpeg', size: null })).toBeNull();
  });

  it('la foto de avería solo va en el elemento «damaged» de su línea', () => {
    const items = withDamagedPhotoPaths(
      [
        { item_id: 'i-1', quantity: 2, condition: 'ok' as const },
        { item_id: 'i-1', quantity: 1, condition: 'damaged' as const },
        { item_id: 'i-2', quantity: 1, condition: 'damaged' as const },
      ],
      { 'i-1': 't-1/x.jpg' }
    );
    expect(items).toEqual([
      { item_id: 'i-1', quantity: 2, condition: 'ok' },
      { item_id: 'i-1', quantity: 1, condition: 'damaged', photo_path: 't-1/x.jpg' },
      { item_id: 'i-2', quantity: 1, condition: 'damaged' },
    ]);
  });

  it('las fotos del historial se agrupan por archivo (la general se repite por línea)', () => {
    const detail = parseTransferDetail(
      rawDetail({
        events: [
          { id: 'e1', event_type: 'reserve', product_name: 'Lavadora LG', photo_path: null },
          { id: 'e2', event_type: 'dispatch', product_name: 'Lavadora LG', photo_path: 't-1/carga.jpg', user_name: 'Ana' },
          { id: 'e3', event_type: 'dispatch', product_name: 'Nevera Haceb', photo_path: 't-1/carga.jpg' },
          { id: 'e4', event_type: 'receive', product_name: 'Nevera Haceb', condition: 'damaged', photo_path: 't-1/golpe.jpg' },
        ],
      })
    );
    expect(detail.events).toHaveLength(4);
    expect(eventPhotos(detail.events)).toEqual([
      { path: 't-1/carga.jpg', label: 'Salida', createdAt: null, userName: 'Ana' },
      { path: 't-1/golpe.jpg', label: 'Recepción · Nevera Haceb (averiada)', createdAt: null, userName: null },
    ]);
  });
});

describe('fotos de recepciones anuladas y eventos nuevos', () => {
  it('marca «(anulada)» y nombra receipt_voided / assignment', () => {
    const detail = parseTransferDetail(
      rawDetail({
        events: [
          { id: 'e1', event_type: 'assignment', quantity: 0, photo_path: null },
          { id: 'e2', event_type: 'receive', product_name: 'Lavadora LG', photo_path: 't-1/llego.jpg', voided: true, void_reason: 'Mal contado' },
          { id: 'e3', event_type: 'receipt_voided', product_name: 'Lavadora LG', photo_path: 't-1/anula.jpg' },
        ],
      })
    );
    expect(eventPhotos(detail.events).map((photo) => photo.label)).toEqual([
      'Recepción (anulada) · Lavadora LG',
      'Recepción anulada · Lavadora LG',
    ]);
  });
});

describe('droppedUploadedPhotos', () => {
  const photo = (id: string, uploaded: boolean) => ({ id, uri: `file:///${id}.jpg`, mimeType: 'image/jpeg', size: 1, uploaded });

  it('devuelve solo las subidas que se quitaron o se cambiaron', () => {
    expect(droppedUploadedPhotos([photo('a', true)], [null]).map((p) => p.id)).toEqual(['a']);
    expect(droppedUploadedPhotos([photo('a', true)], [photo('b', false)]).map((p) => p.id)).toEqual(['a']);
    expect(droppedUploadedPhotos([photo('a', true)], [photo('a', true)])).toEqual([]);
    expect(droppedUploadedPhotos([photo('a', false)], [null])).toEqual([]);
    expect(droppedUploadedPhotos([null, undefined], [])).toEqual([]);
  });
});
