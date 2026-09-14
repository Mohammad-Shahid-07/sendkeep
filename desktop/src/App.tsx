import { Panel } from './components/Panel';
import { TransferProgressOverlay } from './components/TransferProgressOverlay';
import { useEdgeHover } from './hooks/useEdgeHover';
import './styles/tokens.css';
import './styles/global.css';
import './styles/item.css';
import './styles/panel.css';

export function App() {
  useEdgeHover();

  return (
    <main className="w-full h-full overflow-hidden bg-transparent">
      <Panel />
      <TransferProgressOverlay />
    </main>
  );
}

export default App;
