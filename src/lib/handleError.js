// Error handler terpusat: log teknis di konsol, pesan ramah di UI

import { friendlyError, ERROR_MESSAGES, getErrorMessage } from './feedback';

const isProd = import.meta.env.PROD;

export { ERROR_MESSAGES, getErrorMessage, friendlyError };

export function handleError(e, fallback = 'Terjadi kesalahan. Silakan coba lagi.', toastFn = null) {
  const err = e ?? {};

  if (!isProd) {
    console.error('[DEV ERROR]', e);
  } else {
    console.error('[ERROR]', err?.code || err?.message || e);
  }

  const display = friendlyError(err, fallback);

  if (toastFn) {
    toastFn(display);
  }

  return display;
}
