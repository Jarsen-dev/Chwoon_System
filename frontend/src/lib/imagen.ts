// Las fotos que manda un celular rondan los 4 MB (3072×4096). Ni el OCR de
// remisiones ni la evidencia de calidad necesitan tanto: bajarlas antes de
// subir acelera el envío desde la red de la planta y deja de llenar el disco
// con evidencia gigante.
const LADO_MAXIMO = 2000;
const CALIDAD_JPEG = 0.85;

/** Reescala la foto en el navegador. Si algo falla (formato raro, canvas
 *  bloqueado) regresa el archivo original: subir de más es preferible a no
 *  poder guardar la evidencia. */
export async function reescalarFoto(file: File, nombreBase = 'foto'): Promise<File> {
  if (!file.type.startsWith('image/')) return file;
  let bitmap: ImageBitmap;
  try {
    // El canvas descarta el EXIF, así que la rotación hay que aplicarla a los
    // píxeles aquí o se pierde. Explícito porque el default varía entre
    // navegadores; el OSD de Tesseract agradece la foto ya derecha.
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    return file;
  }
  try {
    const escala = Math.min(1, LADO_MAXIMO / Math.max(bitmap.width, bitmap.height));
    if (escala === 1) return file;

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * escala);
    canvas.height = Math.round(bitmap.height * escala);
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise<Blob | null>(resolve =>
      canvas.toBlob(resolve, 'image/jpeg', CALIDAD_JPEG));
    if (!blob || blob.size >= file.size) return file;

    const nombre = file.name.replace(/\.[^.]+$/, '') || nombreBase;
    return new File([blob], `${nombre}.jpg`, { type: 'image/jpeg' });
  } catch {
    return file;
  } finally {
    bitmap.close();
  }
}
