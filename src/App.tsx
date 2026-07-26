import { useEffect, useState } from 'react';
import { I18nProvider, useI18n, type Dict } from './i18n';
import { useCatsStore } from './store';
import { TreeScreen } from './TreeScreen';

const SCREEN_KEY = 'mewgenics-screen';

/** The screens of the app; the list grows as panels graduate into screens. */
const NAV: { key: string; icon: string; label: keyof Dict }[] = [
  { key: 'tree', icon: '🌳', label: 'navTree' },
];
type Screen = (typeof NAV)[number]['key'];

function loadScreen(): Screen {
  const saved = localStorage.getItem(SCREEN_KEY);
  return NAV.some((s) => s.key === saved) ? (saved as Screen) : NAV[0].key;
}

function Shell() {
  const { t } = useI18n();
  const store = useCatsStore();
  const [screen, setScreen] = useState<Screen>(loadScreen);

  useEffect(() => {
    localStorage.setItem(SCREEN_KEY, screen);
  }, [screen]);

  return (
    <div className="shell">
      <nav className="topnav">
        <span className="nav-brand">🐱 Mewgenics Genealogy</span>
        {NAV.map((s) => (
          <button
            key={s.key}
            type="button"
            className={`nav-tab${screen === s.key ? ' on' : ''}`}
            onClick={() => setScreen(s.key)}
          >
            {s.icon} {t[s.label] as string}
          </button>
        ))}
      </nav>
      <main className="screen">{screen === 'tree' && <TreeScreen store={store} />}</main>
    </div>
  );
}

export default function App() {
  return (
    <I18nProvider>
      <Shell />
    </I18nProvider>
  );
}
