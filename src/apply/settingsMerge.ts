/**
 * Pure, format-preserving merge of exclusion globs into a `settings.json`
 * (JSONC) text. Uses `jsonc-parser` so existing keys, comments, and formatting
 * are preserved — never clobbered — and re-runs are idempotent (globs already
 * present are skipped). No `vscode` import, so it is fully unit-testable.
 */
import { applyEdits, FormattingOptions, modify, parse } from 'jsonc-parser';
import { ExclusionPayload } from '../recommendations/types';

export interface SettingsMergeResult {
  /** The new settings.json text (equals input when nothing changed). */
  newText: string;
  changed: boolean;
  addedSearchExclude: string[];
  addedFilesExclude: string[];
}

const DEFAULT_FORMATTING: FormattingOptions = { tabSize: 2, insertSpaces: true, eol: '\n' };

export function mergeExclusions(
  currentText: string,
  payload: ExclusionPayload,
  formatting: FormattingOptions = DEFAULT_FORMATTING,
): SettingsMergeResult {
  let text = currentText && currentText.trim() ? currentText : '{}';
  const root = (parse(text) as Record<string, any> | undefined) ?? {};

  const existingSearch = isObject(root['search.exclude']) ? root['search.exclude'] : {};
  const existingFiles = isObject(root['files.exclude']) ? root['files.exclude'] : {};

  const addedSearchExclude: string[] = [];
  const addedFilesExclude: string[] = [];
  const options = { formattingOptions: formatting };

  for (const glob of payload.searchExclude) {
    if (existingSearch[glob] === true) {
      continue;
    }
    text = applyEdits(text, modify(text, ['search.exclude', glob], true, options));
    addedSearchExclude.push(glob);
  }

  for (const glob of payload.filesExclude) {
    if (existingFiles[glob] === true) {
      continue;
    }
    text = applyEdits(text, modify(text, ['files.exclude', glob], true, options));
    addedFilesExclude.push(glob);
  }

  const changed = addedSearchExclude.length > 0 || addedFilesExclude.length > 0;
  return {
    newText: changed ? text : currentText,
    changed,
    addedSearchExclude,
    addedFilesExclude,
  };
}

function isObject(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
