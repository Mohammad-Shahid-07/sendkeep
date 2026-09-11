import { Panel } from './components/Panel';
import { useEdgeHover } from './hooks/useEdgeHover';
import './styles/tokens.css';
import './styles/global.css';

export function App() {
  useEdgeHover();

  return (
    <main className="w-screen h-screen overflow-hidden bg-transparent">
      <Panel />
    </main>
  );
}

export default App;
