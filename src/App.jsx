import { useEffect, useState } from 'react';
import Header from './components/Header';
import Zone1Scanner from './components/Zone1Scanner';
import Zone2Search from './components/Zone2Search';
import Zone3Actions from './components/Zone3Actions';
import DevStateControls from './components/DevStateControls';
import { getDB } from './db/db.js';
import mockData from './db/mockData';
import {
  getValidToken,
  initTokenClient,
  loadGoogleIdentityScript,
  requestGoogleAuth,
  saveSessionToken,
} from './services/authService';
import { executeSearch } from './services/searchService';
import {
  clearAllStores,
  getAllVisitors,
  getVisitorById,
  registerAttendance,
  seedMockVisitors,
  undoAttendance,
} from './services/visitorService';

export default function App() {
  const [appState, setAppState] = useState('READY_EMPTY');
  const [isOffline, setIsOffline] = useState(false);
  const [visitorList, setVisitorList] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedVisitor, setSelectedVisitor] = useState(null);
  const [searchStatus, setSearchStatus] = useState('IDLE');
  const [searchResults, setSearchResults] = useState([]);
  const [searchMessage, setSearchMessage] = useState('');
  const [tokenClient, setTokenClient] = useState(null);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [authMessage, setAuthMessage] = useState('');

  const isAuthPhase = appState === 'AUTH_PENDING' || appState === 'FILE_PICKER_PENDING';

  const refreshVisitors = async () => {
    const visitors = await getAllVisitors();
    setVisitorList(visitors);
    setSelectedVisitor((current) => {
      if (!current) {
        return null;
      }

      return visitors.find((visitor) => visitor.visitorId === current.visitorId) ?? null;
    });

    if (visitors.length > 0) {
      setAppState('READY_EMPTY');
      return;
    }

    const validToken = await getValidToken();
    setAppState(validToken ? 'FILE_PICKER_PENDING' : 'AUTH_PENDING');
  };

  useEffect(() => {
    let isMounted = true;

    const initializeBootSequence = async () => {
      try {
        await refreshVisitors();

        if (!isMounted) {
          return;
        }

        if (appState === 'AUTH_PENDING' || appState === 'FILE_PICKER_PENDING') {
          await loadGoogleIdentityScript();
          const client = initTokenClient(handleAuthSuccess, handleAuthError);
          setTokenClient(client);
        }
      } catch (error) {
        console.error(error);
        if (isMounted) {
          setAppState('AUTH_PENDING');
        }
      }
    };

    initializeBootSequence();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    const result = executeSearch(searchQuery, visitorList);
    setSearchStatus(result.status);
    setSearchResults(result.data ?? []);
    setSearchMessage(result.message ?? '');
  }, [searchQuery, visitorList]);

  const handleAuthSuccess = async () => {
    setIsAuthenticating(false);
    setAuthMessage('');
    setAppState('FILE_PICKER_PENDING');
  };

  const handleAuthError = (error) => {
    console.error(error);
    setIsAuthenticating(false);
    setAuthMessage('No se pudo conectar con Google. Intente nuevamente.');
    setAppState('AUTH_PENDING');
  };

  const handleAuthenticate = async () => {
    try {
      setIsAuthenticating(true);
      setAuthMessage('Conectando con Google...');

      if (!tokenClient) {
        await loadGoogleIdentityScript();
        const client = initTokenClient(handleAuthSuccess, handleAuthError);
        setTokenClient(client);
        requestGoogleAuth(client, 'select_account');
        return;
      }

      requestGoogleAuth(tokenClient, 'select_account');
    } catch (error) {
      handleAuthError(error);
    }
  };

  const handleSeedMockData = async () => {
    try {
      await seedMockVisitors(mockData);
      await refreshVisitors();
      alert('Datos mock cargados en IndexedDB');
    } catch (error) {
      console.error(error);
      alert('No se pudieron cargar los datos mock');
    }
  };

  const handleClearDatabase = async () => {
    try {
      await clearAllStores();
      setVisitorList([]);
      setSelectedVisitor(null);
      setSearchQuery('');
      setSearchStatus('IDLE');
      setSearchResults([]);
      setSearchMessage('');
      setAuthMessage('');
      setIsAuthenticating(false);
      setAppState('AUTH_PENDING');
    } catch (error) {
      console.error(error);
      alert('No se pudo limpiar la base de datos');
    }
  };

  const handleSimulateGoogleAuth = async () => {
    try {
      await saveSessionToken({ access_token: 'mock_oauth_token_123' });
      setAppState('FILE_PICKER_PENDING');
      setAuthMessage('');
      setIsAuthenticating(false);
    } catch (error) {
      console.error(error);
      alert('No se pudo simular la autenticación');
    }
  };

  const handleSimulateExpiredToken = async () => {
    try {
      const db = await getDB();
      const tx = db.transaction(['sessionStateStore'], 'readwrite');
      const store = tx.objectStore('sessionStateStore');
      const sessionRecord = await store.get('CURRENT_SESSION');

      if (sessionRecord) {
        await store.put({
          ...sessionRecord,
          tokenAcquisitionTime: Date.now() - 7_200_000,
        });
      }

      await tx.done;
      setAppState('AUTH_PENDING');
      setAuthMessage('');
    } catch (error) {
      console.error(error);
      alert('No se pudo simular el token expirado');
    }
  };

  const handleSelectVisitor = (visitor) => {
    setSelectedVisitor(visitor);
    setAppState('CONFIRMED_MATCH');
  };

  const handleBarcodeScanned = async (scannedIdentifier) => {
    const normalizedIdentifier = String(scannedIdentifier ?? '').trim();

    if (!normalizedIdentifier) {
      return;
    }

    try {
      const matchedVisitor = await getVisitorById(normalizedIdentifier);

      if (matchedVisitor) {
        setSelectedVisitor(matchedVisitor);
        setAppState('CONFIRMED_MATCH');
        return;
      }

      const searchResult = executeSearch(normalizedIdentifier, visitorList);
      setSearchQuery(normalizedIdentifier);
      setSearchStatus(searchResult.status);
      setSearchResults(searchResult.data ?? []);
      setSearchMessage(searchResult.message ?? '');
      setAppState(searchResult.data?.length > 1 ? 'MULTI_MATCH' : 'READY_EMPTY');
    } catch (error) {
      console.error(error);
      alert('No se pudo procesar el escaneo');
    }
  };

  const handleRegisterAttendance = async (visitorId) => {
    try {
      const updatedVisitor = await registerAttendance(visitorId);
      setSelectedVisitor(updatedVisitor);
      setVisitorList((current) =>
        current.map((visitor) => (visitor.visitorId === visitorId ? updatedVisitor : visitor)),
      );
    } catch (error) {
      console.error(error);
      alert('No se pudo registrar la asistencia');
    }
  };

  const handleUndoAttendance = async (visitorId) => {
    try {
      const updatedVisitor = await undoAttendance(visitorId);
      setSelectedVisitor(updatedVisitor);
      setVisitorList((current) =>
        current.map((visitor) => (visitor.visitorId === visitorId ? updatedVisitor : visitor)),
      );
    } catch (error) {
      console.error(error);
      alert('No se pudo anular la asistencia');
    }
  };

  // Phase 6: Google Picker will open here to select the master spreadsheet from Drive.
  const handleSelectFile = () => {
    console.warn('handleSelectFile: Google Picker not yet implemented (Phase 6).');
  };

  // Phase 6: Batch sync of attendance records to the working Drive copy.
  const handleSyncWithDrive = () => {
    console.warn('handleSyncWithDrive: Drive batch sync not yet implemented (Phase 6).');
  };

  return (
    <main className="relative flex h-screen w-screen flex-col overflow-hidden bg-brand-light text-brand-slate select-none">
      <Header isOffline={isOffline} />

      {!isAuthPhase && (
        <Zone1Scanner isActive={!isAuthPhase} onScanSuccess={handleBarcodeScanned} />
      )}

      <Zone2Search
        isDisabled={isAuthPhase}
        onSearchChange={setSearchQuery}
        searchValue={searchQuery}
      />

      <div className="relative flex flex-1 flex-col overflow-hidden">
        <Zone3Actions
          activeState={appState}
          searchStatus={searchStatus}
          searchResults={searchResults}
          searchMessage={searchMessage}
          selectedVisitor={selectedVisitor}
          onSelectVisitor={handleSelectVisitor}
          onRegisterAttendance={handleRegisterAttendance}
          onUndoAttendance={handleUndoAttendance}
          onAuthenticate={handleAuthenticate}
          isAuthenticating={isAuthenticating}
          authMessage={authMessage}
          onSelectFile={handleSelectFile}
          onSyncWithDrive={handleSyncWithDrive}
        />
      </div>

      <DevStateControls
        currentState={appState}
        onStateChange={setAppState}
        isOffline={isOffline}
        onOfflineToggle={() => setIsOffline(!isOffline)}
        onSeedMockData={handleSeedMockData}
        onClearDatabase={handleClearDatabase}
        onSimulateBarcodeScan={handleBarcodeScanned}
        onSimulateGoogleAuth={handleSimulateGoogleAuth}
        onSimulateExpiredToken={handleSimulateExpiredToken}
        defaultScanValue={mockData[0]?.visitorId ?? '12345678'}
      />
    </main>
  );
}
