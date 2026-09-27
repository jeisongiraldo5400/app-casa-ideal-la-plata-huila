import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { Alert } from 'react-native';
import { validatePagoSupportLocalFile, type PagoSupportLocalFile } from '@/lib/uploadPagoSupport';

export type PagoSupportSource = 'camera' | 'gallery' | 'document';

/**
 * Pide el soporte de un pago con cámara, galería o archivo (imagen/PDF).
 * Avisa con `Alert` si falta el permiso o el archivo no es válido y devuelve
 * `null` en esos casos o si el usuario cancela.
 */
export async function pickPagoSupportFile(source: PagoSupportSource): Promise<PagoSupportLocalFile | null> {
  let file: PagoSupportLocalFile | null = null;
  if (source === 'document') {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['application/pdf', 'image/*'],
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (result.canceled || !result.assets?.[0]) return null;
    const asset = result.assets[0];
    file = {
      uri: asset.uri,
      mimeType: asset.mimeType || 'application/pdf',
      name: asset.name || `soporte-${Date.now()}.pdf`,
      size: asset.size,
    };
  } else {
    const camera = source === 'camera';
    const permission = camera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        'Permiso requerido',
        camera ? 'Activa la cámara para capturar el soporte.' : 'Activa la galería para adjuntar el soporte.'
      );
      return null;
    }
    const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.7 };
    const result = camera
      ? await ImagePicker.launchCameraAsync(options)
      : await ImagePicker.launchImageLibraryAsync(options);
    if (result.canceled || !result.assets?.[0]) return null;
    const asset = result.assets[0];
    file = {
      uri: asset.uri,
      mimeType: asset.mimeType || 'image/jpeg',
      name: asset.fileName || `soporte-${Date.now()}.jpg`,
      size: asset.fileSize,
    };
  }
  const validationError = validatePagoSupportLocalFile(file);
  if (validationError) {
    Alert.alert('Archivo inválido', validationError);
    return null;
  }
  return file;
}
