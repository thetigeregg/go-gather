import { Capacitor } from '@capacitor/core';
import { FilePicker, type PickedFile } from '@capawesome/capacitor-file-picker';
import { isNativePlatform } from './native-platform.util';

export type PickJsonTextOutcome =
  { status: 'cancelled' } | { status: 'picked'; text: string; name: string };

const JSON_ACCEPT = '.json,application/json';
const JSON_PICK_TYPES = ['application/json', 'text/plain'];

export async function pickJsonTextFile(): Promise<PickJsonTextOutcome> {
  if (!isNativePlatform()) {
    const file = await pickFileViaWebInput(JSON_ACCEPT);

    if (!file) {
      return { status: 'cancelled' };
    }

    const text = await file.text();
    return { status: 'picked', text, name: file.name };
  }

  try {
    const result = await FilePicker.pickFiles({
      types: JSON_PICK_TYPES,
      limit: 1,
    });

    if (result.files.length === 0) {
      return { status: 'cancelled' };
    }

    const picked = result.files[0];

    const file = await pickedFileToFile(picked);

    if (!file) {
      throw new Error('Unable to read picked file');
    }

    const text = await file.text();
    return { status: 'picked', text, name: file.name };
  } catch (error: unknown) {
    if (isPickCancelError(error)) {
      return { status: 'cancelled' };
    }

    throw error;
  }
}

async function pickedFileToFile(picked: PickedFile): Promise<File | null> {
  if (picked.blob) {
    const mimeType = picked.mimeType || picked.blob.type || 'application/octet-stream';
    return tryCreateFile(picked.blob, picked.name, mimeType);
  }

  if (picked.path) {
    try {
      const response = await fetch(Capacitor.convertFileSrc(picked.path));

      if (!response.ok) {
        return null;
      }

      const blob = await response.blob();
      const mimeType = picked.mimeType || blob.type || 'application/octet-stream';
      return tryCreateFile(blob, picked.name, mimeType);
    } catch {
      return null;
    }
  }

  return null;
}

const WEB_FILE_INPUT_FOCUS_FALLBACK_MS = 500;

function pickFileViaWebInput(accept: string): Promise<File | null> {
  if (typeof document === 'undefined' || typeof window === 'undefined') {
    return Promise.resolve(null);
  }

  const body = Reflect.get(document, 'body');
  if (!(body instanceof HTMLElement)) {
    return Promise.resolve(null);
  }

  return new Promise<File | null>((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.style.display = 'none';

    let settled = false;

    const settle = (file: File | null) => {
      if (settled) {
        return;
      }

      settled = true;
      cleanup();
      resolve(file);
    };

    const onWindowFocus = () => {
      window.setTimeout(() => {
        if (settled) {
          return;
        }

        settle(input.files?.[0] ?? null);
      }, WEB_FILE_INPUT_FOCUS_FALLBACK_MS);
    };

    const cleanup = () => {
      window.removeEventListener('focus', onWindowFocus);
      input.remove();
    };

    input.addEventListener('change', () => {
      settle(input.files?.[0] ?? null);
    });

    input.addEventListener('cancel', () => {
      settle(null);
    });

    window.addEventListener('focus', onWindowFocus);
    body.appendChild(input);
    input.click();
  });
}

function tryCreateFile(blob: Blob, filename: string, mimeType: string): File | null {
  try {
    if (typeof File !== 'function') {
      return null;
    }

    return new File([blob], filename, { type: mimeType });
  } catch {
    return null;
  }
}

function isPickCancelError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return true;
  }

  const message = error instanceof Error ? error.message : '';
  return /abort|cancel/i.test(message);
}
