import { useState } from 'react';
import Header from './components/Header';
import Zone1Scanner from './components/Zone1Scanner';
import Zone2Search from './components/Zone2Search';
import Zone3Actions from './components/Zone3Actions';
import DevStateControls from './components/DevStateControls';

export default function App() {
  const [appState, setAppState] = useState('READY_EMPTY');
  const [isOffline, setIsOffline] = useState(false);

  const isAuthPhase = appState === 'AUTH_PENDING' || appState === 'FILE_PICKER_PENDING';

  return (
    <main className="relative flex h-screen w-screen flex-col overflow-hidden bg-brand-light text-brand-slate select-none">
      <Header isOffline={isOffline} />

      {!isAuthPhase && <Zone1Scanner isActive={true} />}

      <Zone2Search isDisabled={isAuthPhase} />

      <div className="relative flex flex-1 flex-col overflow-hidden">
        <Zone3Actions activeState={appState} />
      </div>

      <DevStateControls
        currentState={appState}
        onStateChange={setAppState}
        isOffline={isOffline}
        onOfflineToggle={() => setIsOffline(!isOffline)}
      />
    </main>
  );
}
