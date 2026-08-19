import { getValidToken } from './authService.js';

const GOOGLE_API_SCRIPT_URL = 'https://apis.google.com/js/api.js';

let pickerScriptPromise = null;

export function loadGooglePickerScript() {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.reject(new Error('Google Picker can only be loaded in the browser.'));
  }

  if (window.gapi?.picker) {
    return Promise.resolve();
  }

  if (!pickerScriptPromise) {
    pickerScriptPromise = new Promise((resolve, reject) => {
      const loadPickerLib = () => {
        window.gapi.load('picker', {
          callback: resolve,
          onerror: () => {
            pickerScriptPromise = null;
            reject(new Error('Failed to load Google Picker library.'));
          },
        });
      };

      const existing = document.querySelector(`script[src="${GOOGLE_API_SCRIPT_URL}"]`);

      if (existing) {
        if (window.gapi) {
          loadPickerLib();
        } else {
          existing.addEventListener('load', loadPickerLib, { once: true });
          existing.addEventListener('error', () => {
            pickerScriptPromise = null;
            reject(new Error('Failed to load Google API script.'));
          }, { once: true });
        }
        return;
      }

      const script = document.createElement('script');
      script.src = GOOGLE_API_SCRIPT_URL;
      script.async = true;
      script.defer = true;
      script.onload = loadPickerLib;
      script.onerror = () => {
        pickerScriptPromise = null;
        reject(new Error('Failed to load Google API script.'));
      };
      document.head.appendChild(script);
    });
  }

  return pickerScriptPromise;
}

export async function openSpreadsheetPicker(onFileSelected, onError) {
  const token = await getValidToken();

  if (!token) {
    onError?.({ status: 'AUTH_REQUIRED', message: 'Sesión expirada. Confirme su cuenta.' });
    return;
  }

  try {
    await loadGooglePickerScript();

    const view = new window.google.picker.DocsView(window.google.picker.ViewId.SPREADSHEETS);
    view.setMimeTypes(
      'application/vnd.google-apps.spreadsheet,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );

    const pickerCallback = (data) => {
      if (data.action === window.google.picker.Action.PICKED) {
        const doc = data.docs[0];
        onFileSelected?.({
          id: doc[window.google.picker.Document.ID],
          name: doc[window.google.picker.Document.NAME],
        });
      }
    };

    new window.google.picker.PickerBuilder()
      .setDeveloperKey(import.meta.env.VITE_GOOGLE_API_KEY)
      .setOAuthToken(token)
      .addView(view)
      .setCallback(pickerCallback)
      .build()
      .setVisible(true);
  } catch (error) {
    onError?.(error);
  }
}
