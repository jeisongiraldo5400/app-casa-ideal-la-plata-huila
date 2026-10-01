import * as ImagePicker from 'expo-image-picker';
import { Alert } from 'react-native';
import { createIdempotencyKey } from '@/lib/idempotency';
import { validateTransferPhoto, type TransferPhotoDraft } from '../../utils/transferPhotos';

export type TransferPhotoSource = 'camera' | 'gallery';

/**
 * Toma o elige una foto (mismo patrón que el soporte de pagos). Sin
 * manipulador de imágenes instalado, se comprime con `quality` del selector:
 * una foto de cámara en JPEG 0.5 queda muy por debajo de 5 MB. Devuelve
 * `null` si se cancela, falta el permiso o el archivo no sirve (con aviso).
 */
export async function pickTransferPhoto(source: TransferPhotoSource): Promise<TransferPhotoDraft | null> {
  const camera = source === 'camera';
  const permission = camera
    ? await ImagePicker.requestCameraPermissionsAsync()
    : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    Alert.alert(
      'Permiso requerido',
      camera ? 'Activa la cámara para tomar la foto.' : 'Activa la galería para adjuntar la foto.'
    );
    return null;
  }
  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.5, exif: false };
  const result = camera ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
  if (result.canceled || !result.assets?.[0]) return null;
  const asset = result.assets[0];
  const photo: TransferPhotoDraft = {
    id: createIdempotencyKey(),
    uri: asset.uri,
    mimeType: asset.mimeType || 'image/jpeg',
    size: asset.fileSize ?? null,
    uploaded: false,
  };
  const invalid = validateTransferPhoto(photo);
  if (invalid) {
    Alert.alert('Foto inválida', invalid);
    return null;
  }
  return photo;
}
