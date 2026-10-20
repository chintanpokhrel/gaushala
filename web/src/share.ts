/**
 * Sending files out of the app. On iPhone a web app cannot open one WhatsApp chat with an image
 * attached, so the bill goes through the share sheet and the user picks the contact there.
 */

export function canvasToFile(canvas: HTMLCanvasElement, name: string): Promise<File> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(new File([b], name, { type: 'image/png' })) : reject(new Error('No image'))), 'image/png');
  });
}

export const canShareFile = (file: File): boolean => !!navigator.canShare?.({ files: [file] });

/**
 * Opens the share sheet with [file]. Call straight from the tap handler with a file made beforehand:
 * iOS refuses share() once the tap is "used up" by waiting for something else.
 * Resolves false when the user closed the sheet.
 */
export async function shareFile(file: File, text?: string): Promise<boolean> {
  try {
    await navigator.share(text ? { files: [file], text } : { files: [file] });
    return true;
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return false;
    throw e;
  }
}

/** For browsers without file sharing (most desktops): saves the file instead. */
export function download(file: File): void {
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Digits only, with the country code added to a 10-digit local number. */
export function whatsAppNumber(phone: string, countryCode: string): string | null {
  const digits = phone.replace(/\D/g, '').replace(/^0+/, '');
  if (digits.length === 10) return countryCode.replace(/\D/g, '') + digits;
  if (digits.length > 10) return digits;
  return null;
}

/** Customer's WhatsApp chat with [text] typed in; used where the image cannot be attached. */
export const whatsAppChatLink = (number: string, text: string): string =>
  `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
