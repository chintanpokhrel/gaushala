import { en, type Strings } from './en';
import { ne } from './ne';

/**
 * A language: its strings plus the Intl locale for dates. Passed explicitly (like Android's Context)
 * so a bill can be drawn in the other language without switching the app.
 */
export interface Lang {
  tag: Tag;
  s: Strings;
  /** Latin digits in both languages, as on UPI apps. */
  intl: string;
}

export type Tag = 'en' | 'ne';

export const LANGS: Record<Tag, Lang> = {
  en: { tag: 'en', s: en, intl: 'en-IN' },
  ne: { tag: 'ne', s: ne, intl: 'ne-NP-u-nu-latn' },
};

export type TextKey = { [K in keyof Strings]: Strings[K] extends string ? K : never }[keyof Strings];
export type ListKey = Exclude<keyof Strings, TextKey>;

/** The string for [key] with {1}, {2}… filled in. */
export function t(l: Lang, key: TextKey, ...args: (string | number)[]): string {
  return l.s[key].replace(/\{(\d)\}/g, (_, i: string) => String(args[Number(i) - 1]));
}

export const list = (l: Lang, key: ListKey): string[] => l.s[key];

const KEY = 'lang';

export function savedTag(): Tag {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'en' || v === 'ne') return v;
  } catch {
    // Storage blocked: fall through to the phone language.
  }
  return navigator.language.toLowerCase().startsWith('ne') ? 'ne' : 'en';
}

export function saveTag(tag: Tag): void {
  try {
    localStorage.setItem(KEY, tag);
  } catch {
    // Not remembered; the app still switches for this session.
  }
}
