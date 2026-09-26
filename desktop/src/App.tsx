import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Panel } from './components/Panel';
import { TransferProgressOverlay } from './components/TransferProgressOverlay';
import { useEdgeHover } from './hooks/useEdgeHover';
import { InstallerApp } from './InstallerApp';
import './styles/tokens.css';
import './styles/global.css';
import './styles/item.css';
import './styles/panel.css';

function MainShelf() {
  useEdgeHover();

  useEffect(() => {
    invoke('show_shelf_window').catch(() => {});
  }, []);

  return (
    <main className="w-full h-screen overflow-hidden bg-transparent pointer-events-none">
      <Panel />
      <TransferProgressOverlay />
    </main>
  );
}

export function App() {
  const [isInstaller, setIsInstaller] = useState<boolean>(() => {
    return (
      window.location.search.includes('mode=installer') ||
      window.location.hash === '#/installer'
    );
  });

  useEffect(() => {
    if (!isInstaller) {
      invoke<boolean>('check_is_installer_mode')
        .then((res) => {
          if (res) setIsInstaller(true);
        })
        .catch(() => {});
    }
  }, [isInstaller]);

  if (isInstaller) {
    return <InstallerApp />;
  }

  return <MainShelf />;
}

export default App;
