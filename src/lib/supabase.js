import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const localLocks = new Map();

async function localLock(name, acquireTimeout, fn) {
  const previous = localLocks.get(name) || Promise.resolve();

  let releaseCurrent;
  const current = new Promise((resolve) => {
    releaseCurrent = resolve;
  });

  const next = previous.catch(() => undefined).then(() => current);
  localLocks.set(name, next);

  let timeoutId = null;

  try {
    if (acquireTimeout > 0) {
      await Promise.race([
        previous,
        new Promise((_, reject) => {
          timeoutId = setTimeout(() => {
            reject(new Error(`Local lock timeout: ${name}`));
          }, acquireTimeout);
        }),
      ]);
    } else {
      await previous;
    }

    return await fn();
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
    releaseCurrent?.();

    if (localLocks.get(name) === next) {
      localLocks.delete(name);
    }
  }
}

export const supabase =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
          lock: localLock,
          lockAcquireTimeout: 2000,
        },
      })
    : null;
