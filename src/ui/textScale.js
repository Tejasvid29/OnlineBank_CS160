import { createContext, useContext } from 'react';
import { useWindowDimensions } from 'react-native';

// Text size on the phone has two parts that multiply:
//   1. The phone's own text size (iOS Dynamic Type, Android Font size). React Native applies it to every Text and
//      TextInput by itself and reports it as fontScale (1 = default; up to about 3.1 on iOS, 2 on Android).
//   2. The app's "Larger text" setting on Profile. Text in src/ui/primitives.jsx applies it by enlarging fontSize.
// Larger text adds 25%, but never takes the combined size past 200%: on a phone already set that large it adds
// nothing, so it can't push text past what the layouts handle. Web uses browser zoom instead and always gets 1.
export const LARGER_TEXT_FACTOR = 1.25;
const LARGER_TEXT_LIMIT = 2;

// From this combined scale on, the phone screens switch to their large-text layouts (stacked rows, lists instead
// of side-by-side tiles). iOS reaches it at its largest standard size plus Larger text, or at the accessibility sizes.
const LARGE_TEXT = 1.5;

// Largest combined scale (maxFontSizeMultiplier) for the few texts that may not grow freely. Body text is never capped.
//   chrome:  text inside fixed controls (tab bar labels, badge, avatar initial). iOS's own tab bars don't scale either;
//            the tab bar shows the large content viewer on a long press instead.
//   display: text that is already big (balances, the login headline, the brand name).
//   heading: titles, so one long word still fits on a line.
export const TEXT_CAP = { chrome: 1.3, display: 1.5, heading: 2 };

// The Larger text factor, provided by AppState.
export const TextScaleContext = createContext(1);

export function largerTextFactor(enabled, fontScale) {
  return enabled ? Math.min(LARGER_TEXT_FACTOR, Math.max(1, LARGER_TEXT_LIMIT / fontScale)) : 1;
}

// scale: the combined text scale. large: whether to use the large-text layouts.
export function useTextScale() {
  const { fontScale } = useWindowDimensions();
  const factor = useContext(TextScaleContext);
  const scale = (fontScale || 1) * factor;
  return { scale, factor, fontScale: fontScale || 1, large: scale >= LARGE_TEXT };
}
