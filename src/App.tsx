import { useEffect, useRef, useState } from 'react';
import { I18nProvider, useI18n, type Dict } from './i18n';
import { useCatsStore } from './store';
import { TreeScreen } from './TreeScreen';
import { OverviewScreen } from './OverviewScreen';
import { BreedingScreen } from './BreedingScreen';

const SCREEN_KEY = 'mewgenics-screen';

/** The screens of the app; the list grows as panels graduate into screens. */
const NAV: { key: string; icon: string; label: keyof Dict }[] = [
  { key: 'cats', icon: '🐈', label: 'navCats' },
  { key: 'breeding', icon: '💕', label: 'navBreeding' },
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
  // A cat to focus when arriving at the tree from another screen.
  const [treeFocus, setTreeFocus] = useState<string | null>(null);
  // A cat to preselect as the first parent when arriving at the breeding screen.
  const [breedFocus, setBreedFocus] = useState<string | null>(null);
  // Screens stay mounted once visited (hidden via CSS) so the tree keeps its
  // layout/viewport and list screens keep their filters across tab switches.
  const visited = useRef(new Set<Screen>());
  visited.current.add(screen);

  useEffect(() => {
    localStorage.setItem(SCREEN_KEY, screen);
  }, [screen]);

  const showInTree = (id: string) => {
    setTreeFocus(id);
    setScreen('tree');
  };

  const openBreeding = (id: string) => {
    setBreedFocus(id);
    setScreen('breeding');
  };

  const fill = (key: Screen, node: React.ReactNode) =>
    visited.current.has(key) ? (
      <div className={`screen-fill${screen === key ? '' : ' hide'}`}>{node}</div>
    ) : null;

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
      <main className="screen">
        {fill(
          'cats',
          <OverviewScreen store={store} onShowInTree={showInTree} onOpenBreeding={openBreeding} />,
        )}
        {fill(
          'breeding',
          <BreedingScreen
            store={store}
            sourceId={breedFocus}
            onSourceConsumed={() => setBreedFocus(null)}
          />,
        )}
        {fill(
          'tree',
          <TreeScreen store={store} focusId={treeFocus} onFocusDone={() => setTreeFocus(null)} />,
        )}
      </main>
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
