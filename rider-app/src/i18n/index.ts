import { useCallback } from 'react';
import en, { TranslationKey } from './en';
import ur from './ur';
import { useSettingsStore } from '../store/settingsStore';

export type Language = 'en' | 'ur';
export type { TranslationKey };

const dictionaries: Record<Language, Record<TranslationKey, string>> = { en, ur };

export type TParams = Record<string, string | number | null | undefined>;

/** Replace `{name}` placeholders. Missing params are left as-is for visibility. */
export function interpolate(template: string, params?: TParams): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    const value = params[key];
    return value === null || value === undefined ? match : String(value);
  });
}

/** Pure translation for non-React code (services, stores, notifications). */
export function translate(language: Language, key: TranslationKey, params?: TParams): string {
  const dict = dictionaries[language] ?? en;
  const template = dict[key] ?? en[key] ?? key;
  return interpolate(template, params);
}

/** Current language from the persisted settings store (safe outside React). */
export function getLanguage(): Language {
  return useSettingsStore.getState().language;
}

/** Translate with the current app language — for services / stores. */
export function t(key: TranslationKey, params?: TParams): string {
  return translate(getLanguage(), key, params);
}

/** Hook: returns a `t` bound to the live language so components re-render on change. */
export function useT() {
  const language = useSettingsStore((s) => s.language);
  const bound = useCallback(
    (key: TranslationKey, params?: TParams) => translate(language, key, params),
    [language]
  );
  return { t: bound, language };
}

/**
 * Translate a dynamic enum value with a key prefix, e.g.
 * `tEnum('taskStatus', 'in_progress')` → 'On the way'. Falls back to the raw
 * value so an unknown backend state is still visible rather than blank.
 */
export function tEnum(
  language: Language,
  prefix: 'taskType' | 'taskStatus' | 'orderStatus' | 'attaStatus' | 'unit' | 'detail.paymentMethod' | 'profile.vehicle',
  value: string | null | undefined
): string {
  if (!value) return '';
  const key = `${prefix}.${value}` as TranslationKey;
  const dict = dictionaries[language] ?? en;
  if (key in dict) return dict[key];
  if (key in en) return en[key];
  return value.replace(/_/g, ' ');
}

export const SUPPORTED_LANGUAGES: { code: Language; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'ur', label: 'اردو' },
];

export { en, ur };
