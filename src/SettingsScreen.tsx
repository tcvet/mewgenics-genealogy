import { useRef, type ChangeEvent } from 'react';
import { type Cat } from './types';
import { type CatsStore } from './store';
import { LANGS, useI18n, type Lang } from './i18n';

/** The settings screen: UI language and the data tools (export / import / reset). */
export function SettingsScreen({ store }: { store: CatsStore }) {
  const { t, lang, setLang } = useI18n();
  const { cats, importCats, resetAll } = store;
  const fileRef = useRef<HTMLInputElement>(null);

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(cats, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'mewgenics-genealogy.json';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const importJson = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    file.text().then((text) => {
      try {
        const data: unknown = JSON.parse(text);
        if (
          !Array.isArray(data) ||
          !data.every(
            (c) =>
              c &&
              typeof c.id === 'string' &&
              typeof c.name === 'string' &&
              (c.sex === 'F' || c.sex === 'M' || c.sex === '?'),
          )
        ) {
          throw new Error('bad format');
        }
        if (!confirm(t.importConfirm(cats.length, data.length))) {
          return;
        }
        importCats(data as Partial<Cat>[]);
      } catch {
        alert(t.importError);
      }
    });
  };

  const reset = () => {
    if (!confirm(t.resetConfirm)) return;
    resetAll();
  };

  return (
    <div className="se-screen">
      <div className="panel se-panel">
        <h3>⚙️ {t.navSettings}</h3>
        <label className="settings-lang">
          {t.langTitle}
          <select
            className="lang-select"
            value={lang}
            onChange={(e) => setLang(e.target.value as Lang)}
          >
            {LANGS.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label}
              </option>
            ))}
          </select>
        </label>
        <button onClick={exportJson}>{t.exportBtn}</button>
        <button onClick={() => fileRef.current?.click()}>{t.importBtn}</button>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={importJson}
        />
        <button className="danger" onClick={reset}>
          {t.resetBtn}
        </button>
      </div>
    </div>
  );
}
