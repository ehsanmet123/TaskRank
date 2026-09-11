import { StyleSheet, type TextStyle, type ViewStyle } from 'react-native';
import { s, blue } from './styles';

// Explicit layout direction allows language changes without restarting the app.
export function localizedStyles(base: typeof s, rtl: boolean) {
  const result = { ...base };
  for (const key of Object.keys(base) as (keyof typeof base)[]) {
    const style = { ...StyleSheet.flatten(base[key]) } as TextStyle & ViewStyle;
    if (style.flexDirection === 'row') style.flexDirection = rtl ? 'row-reverse' : 'row';
    if ('fontSize' in style) {
      style.writingDirection = rtl ? 'rtl' : 'ltr';
      if (!style.textAlign) style.textAlign = rtl ? 'right' : 'left';
      if (rtl) style.letterSpacing = 0;
    }
    if (rtl) {
      const left = style.marginLeft, right = style.marginRight;
      style.marginLeft = right;
      style.marginRight = left;
      const paddingLeft = style.paddingLeft, paddingRight = style.paddingRight;
      style.paddingLeft = paddingRight;
      style.paddingRight = paddingLeft;
    }
    Object.assign(result, { [key]: style });
  }
  return {
    ...result,
    app: { ...result.app, direction: 'ltr' as const },
    sheet: { ...result.sheet, direction: 'ltr' as const },
    brand: { ...result.brand, flexWrap: 'wrap' as const, paddingBottom: 12 },
    section: { ...result.section, flexWrap: 'wrap' as const, gap: 8 },
    headingText: { ...result.headingText, flexShrink: 1 },
    sheetTitle: { ...result.sheetTitle, flexShrink: 1 },
    cloudButton: { ...result.cloudButton, flexShrink: 1 },
    cloudText: { ...result.cloudText, flexShrink: 1 },
    languageButton: { flexDirection: rtl ? 'row-reverse' as const : 'row' as const, alignItems: 'center' as const, gap: 8, minHeight: 44, marginHorizontal: 26, marginBottom: 18 },
    languageText: { color: blue, fontSize: 15, flexShrink: 1, textAlign: rtl ? 'right' as const : 'left' as const },
    languageOption: { flexDirection: rtl ? 'row-reverse' as const : 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, padding: 14, minHeight: 50, borderRadius: 12, marginBottom: 4 },
  };
}
