import { afterEach, describe, expect, it, vi } from 'vitest';

const isNativePlatformMock = vi.fn<() => boolean>();
const pickFilesMock = vi.fn<(...args: unknown[]) => Promise<{ files: unknown[] }>>();
const convertFileSrcMock = vi.fn<(path: string) => string>();

vi.mock('./native-platform.util', () => ({
  isNativePlatform: () => isNativePlatformMock(),
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    convertFileSrc: (path: string) => convertFileSrcMock(path),
  },
}));

vi.mock('@capawesome/capacitor-file-picker', () => ({
  FilePicker: {
    pickFiles: (...args: unknown[]) => pickFilesMock(...args),
  },
}));

import { pickJsonTextFile } from './pick-file.util';

describe('pick-file.util', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    isNativePlatformMock.mockReset();
    pickFilesMock.mockReset();
    convertFileSrcMock.mockReset();
  });

  function mockWebFileInput(file: File | null): void {
    const input = document.createElement('input');
    const click = vi.fn(() => {
      if (file) {
        Object.defineProperty(input, 'files', {
          configurable: true,
          value: [file],
        });
        input.dispatchEvent(new Event('change'));
      } else {
        input.dispatchEvent(new Event('cancel'));
      }
    });

    vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      if (tagName === 'input') {
        input.click = click;
        return input;
      }

      throw new Error(`Unexpected createElement call: ${tagName}`);
    });
    vi.spyOn(document.body, 'appendChild').mockImplementation((node) => node);
    vi.spyOn(input, 'remove').mockImplementation(() => undefined);
  }

  function mockWebFileInputDismissViaFocus(): void {
    const input = document.createElement('input');
    const click = vi.fn(() => {
      window.dispatchEvent(new Event('focus'));
    });

    vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      if (tagName === 'input') {
        input.click = click;
        return input;
      }

      throw new Error(`Unexpected createElement call: ${tagName}`);
    });
    vi.spyOn(document.body, 'appendChild').mockImplementation((node) => node);
    vi.spyOn(input, 'remove').mockImplementation(() => undefined);
  }

  it('returns JSON text from the native file picker', async () => {
    isNativePlatformMock.mockReturnValue(true);
    convertFileSrcMock.mockReturnValue('capacitor://localhost/_capacitor_file_/import.json');
    pickFilesMock.mockResolvedValue({
      files: [
        {
          name: 'import.json',
          mimeType: 'application/json',
          path: '/picked/import.json',
        },
      ],
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        blob: () => Promise.resolve(new Blob(['{"version":1}'], { type: 'application/json' })),
      })
    );

    const result = await pickJsonTextFile();

    expect(pickFilesMock).toHaveBeenCalledWith({
      types: ['application/json', 'text/plain'],
      limit: 1,
    });
    expect(result).toEqual({
      status: 'picked',
      text: '{"version":1}',
      name: 'import.json',
    });
  });

  it('returns cancelled when native pick returns no files', async () => {
    isNativePlatformMock.mockReturnValue(true);
    pickFilesMock.mockResolvedValue({ files: [] });

    await expect(pickJsonTextFile()).resolves.toEqual({ status: 'cancelled' });
  });

  it('returns cancelled when native pick is dismissed', async () => {
    isNativePlatformMock.mockReturnValue(true);
    pickFilesMock.mockRejectedValue(new DOMException('Picker canceled', 'AbortError'));

    await expect(pickJsonTextFile()).resolves.toEqual({ status: 'cancelled' });
  });

  it('returns cancelled when native pick is dismissed with a cancel message', async () => {
    isNativePlatformMock.mockReturnValue(true);
    pickFilesMock.mockRejectedValue(new Error('User canceled picker'));

    await expect(pickJsonTextFile()).resolves.toEqual({ status: 'cancelled' });
  });

  it('rethrows unexpected native picker failures', async () => {
    isNativePlatformMock.mockReturnValue(true);
    pickFilesMock.mockRejectedValue(new Error('picker failed'));

    await expect(pickJsonTextFile()).rejects.toThrow('picker failed');
  });

  it('throws when native file cannot be converted', async () => {
    isNativePlatformMock.mockReturnValue(true);
    pickFilesMock.mockResolvedValue({
      files: [{ name: 'import.json', mimeType: 'application/json' }],
    });

    await expect(pickJsonTextFile()).rejects.toThrow('Unable to read picked file');
  });

  it('returns a File from a native picker blob result', async () => {
    isNativePlatformMock.mockReturnValue(true);
    const blob = new Blob(['{"version":1}'], { type: 'application/json' });
    pickFilesMock.mockResolvedValue({
      files: [{ name: 'import.json', mimeType: 'application/json', blob }],
    });

    const result = await pickJsonTextFile();

    expect(result).toEqual({ status: 'picked', text: '{"version":1}', name: 'import.json' });
  });

  it('uses blob mime type when picked mime type is missing', async () => {
    isNativePlatformMock.mockReturnValue(true);
    const blob = new Blob(['{"version":1}'], { type: 'application/json' });
    pickFilesMock.mockResolvedValue({
      files: [{ name: 'import.json', blob }],
    });

    const result = await pickJsonTextFile();

    expect(result).toEqual({ status: 'picked', text: '{"version":1}', name: 'import.json' });
  });

  it('throws when native file fetch is not ok', async () => {
    isNativePlatformMock.mockReturnValue(true);
    convertFileSrcMock.mockReturnValue('capacitor://localhost/_capacitor_file_/import.json');
    pickFilesMock.mockResolvedValue({
      files: [{ name: 'import.json', mimeType: 'application/json', path: '/picked/import.json' }],
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        blob: () => Promise.resolve(new Blob()),
      })
    );

    await expect(pickJsonTextFile()).rejects.toThrow('Unable to read picked file');
  });

  it('throws when native file fetch fails', async () => {
    isNativePlatformMock.mockReturnValue(true);
    convertFileSrcMock.mockReturnValue('capacitor://localhost/_capacitor_file_/import.json');
    pickFilesMock.mockResolvedValue({
      files: [{ name: 'import.json', mimeType: 'application/json', path: '/picked/import.json' }],
    });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network error')));

    await expect(pickJsonTextFile()).rejects.toThrow('Unable to read picked file');
  });

  it('throws when File constructor is unavailable', async () => {
    isNativePlatformMock.mockReturnValue(true);
    const blob = new Blob(['{"version":1}'], { type: 'application/json' });
    pickFilesMock.mockResolvedValue({
      files: [{ name: 'import.json', mimeType: 'application/json', blob }],
    });
    vi.stubGlobal('File', undefined);

    await expect(pickJsonTextFile()).rejects.toThrow('Unable to read picked file');
  });

  it('returns JSON text from the web file input', async () => {
    isNativePlatformMock.mockReturnValue(false);
    mockWebFileInput(new File(['{"version":1}'], 'import.json', { type: 'application/json' }));

    const result = await pickJsonTextFile();

    expect(pickFilesMock).not.toHaveBeenCalled();
    expect(result).toEqual({
      status: 'picked',
      text: '{"version":1}',
      name: 'import.json',
    });
  });

  it('returns cancelled when the web file input is dismissed', async () => {
    isNativePlatformMock.mockReturnValue(false);
    mockWebFileInput(null);

    await expect(pickJsonTextFile()).resolves.toEqual({ status: 'cancelled' });
  });

  it('returns cancelled when the web file input is dismissed without a cancel event', async () => {
    vi.useFakeTimers();
    isNativePlatformMock.mockReturnValue(false);
    mockWebFileInputDismissViaFocus();

    const resultPromise = pickJsonTextFile();
    await vi.advanceTimersByTimeAsync(500);

    await expect(resultPromise).resolves.toEqual({ status: 'cancelled' });
    vi.useRealTimers();
  });

  it('returns cancelled when document is unavailable', async () => {
    isNativePlatformMock.mockReturnValue(false);
    vi.stubGlobal('document', undefined);

    await expect(pickJsonTextFile()).resolves.toEqual({ status: 'cancelled' });
  });

  it('returns cancelled when document.body is not an HTMLElement', async () => {
    isNativePlatformMock.mockReturnValue(false);
    vi.stubGlobal('document', { body: null });

    await expect(pickJsonTextFile()).resolves.toEqual({ status: 'cancelled' });
  });

  it('ignores a second settle call if already settled', async () => {
    isNativePlatformMock.mockReturnValue(false);
    vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(function (
      this: HTMLInputElement
    ) {
      this.dispatchEvent(new Event('cancel'));
      this.dispatchEvent(new Event('cancel'));
    });
    vi.spyOn(document.body, 'appendChild').mockImplementation((node) => node);
    vi.spyOn(HTMLInputElement.prototype, 'remove').mockImplementation(() => undefined);

    await expect(pickJsonTextFile()).resolves.toEqual({ status: 'cancelled' });
  });

  it('ignores the focus-fallback timer if already settled by a prior event', async () => {
    vi.useFakeTimers();
    isNativePlatformMock.mockReturnValue(false);
    vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(function (
      this: HTMLInputElement
    ) {
      window.dispatchEvent(new Event('focus'));
      this.dispatchEvent(new Event('cancel'));
    });
    vi.spyOn(document.body, 'appendChild').mockImplementation((node) => node);
    vi.spyOn(HTMLInputElement.prototype, 'remove').mockImplementation(() => undefined);

    const resultPromise = pickJsonTextFile();
    await vi.advanceTimersByTimeAsync(500);

    await expect(resultPromise).resolves.toEqual({ status: 'cancelled' });
    vi.useRealTimers();
  });

  it('propagates web read failures', async () => {
    isNativePlatformMock.mockReturnValue(false);
    const file = new File(['json'], 'import.json', { type: 'application/json' });
    vi.spyOn(file, 'text').mockRejectedValue(new Error('read failed'));
    mockWebFileInput(file);

    await expect(pickJsonTextFile()).rejects.toThrow('read failed');
  });
});
