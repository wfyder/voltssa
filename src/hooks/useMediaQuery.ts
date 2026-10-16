import { useSyncExternalStore } from 'react';

export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(query);
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** Phone layout: narrow screens, or short touch screens (a phone in landscape). Same as the `mobile:` CSS variant. */
export const MOBILE_QUERY = '(max-width: 767px), (max-height: 500px) and (pointer: coarse)';
export const useIsMobile = () => useMediaQuery(MOBILE_QUERY);
export const useIsPortrait = () => useMediaQuery('(orientation: portrait)');
