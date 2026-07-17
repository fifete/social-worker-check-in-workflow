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
  getVisitorsByDni,
  registerAttendance,
  seedMockVisitors,
  undoAttendance,
} from './services/visitorService';
import { openSpreadsheetPicker } from './services/pickerService';
import {
  cloneMasterSpreadsheet,
  fetchSpreadsheetData,
  ingestRowsToIndexedDB,
} from './services/driveService';
import { executeBatchSync } from './services/syncService';

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
  const [isPickerLoading, setIsPickerLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState('');

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
          tokenIssuedAt: Date.now() - 7_200_000,
          refreshToken: null,
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
      const matches = await getVisitorsByDni(normalizedIdentifier);

      if (matches.length === 1) {
        setSelectedVisitor(matches[0]);
        setAppState('CONFIRMED_MATCH');
        return;
      }

      if (matches.length > 1) {
        setSearchQuery(normalizedIdentifier);
        setSearchStatus('SUCCESS');
        setSearchResults(matches);
        setSearchMessage('');
        setAppState('MULTI_MATCH');
        return;
      }

      // No exact ID match — fall back to text search
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

  const handleRegisterAttendance = async (recordId) => {
    try {
      const updatedVisitor = await registerAttendance(recordId);
      setSelectedVisitor(updatedVisitor);
      setVisitorList((current) =>
        current.map((visitor) => (visitor.recordId === recordId ? updatedVisitor : visitor)),
      );
    } catch (error) {
      console.error(error);
      alert('No se pudo registrar la asistencia');
    }
  };

  const handleUndoAttendance = async (recordId) => {
    try {
      const updatedVisitor = await undoAttendance(recordId);
      setSelectedVisitor(updatedVisitor);
      setVisitorList((current) =>
        current.map((visitor) => (visitor.recordId === recordId ? updatedVisitor : visitor)),
      );
    } catch (error) {
      console.error(error);
      alert('No se pudo anular la asistencia');
    }
  };

  // Phase 6: Google Picker opens to select the master spreadsheet, clone it, and ingest rows.
  const handleSelectFile = async () => {
    setIsPickerLoading(true);

    await openSpreadsheetPicker(
      async ({ id: masterFileId, name: masterFileName }) => {
        try {
          const workingFileId = await cloneMasterSpreadsheet(masterFileId, masterFileName);

          if (workingFileId?.status === 'AUTH_REQUIRED') {
            setIsPickerLoading(false);
            setAppState('AUTH_PENDING');
            return;
          }

          const rows = await fetchSpreadsheetData(workingFileId);
          await ingestRowsToIndexedDB(rows, masterFileId, workingFileId);
          await refreshVisitors();
        } catch (error) {
          console.error(error);
          alert(`Error al procesar el archivo: ${error.message}`);
        } finally {
          setIsPickerLoading(false);
        }
      },
      (error) => {
        console.error(error);
        setIsPickerLoading(false);
        if (error?.status === 'AUTH_REQUIRED') {
          setAppState('AUTH_PENDING');
        } else {
          alert('No se pudo abrir el selector de archivos.');
        }
      },
    );
  };

  // Phase 6: Batch sync of attendance records to the cloned Drive file.
  const handleSyncWithDrive = async () => {
    if (isOffline || isSyncing) return;

    try {
      setIsSyncing(true);
      setSyncMessage('');
      const result = await executeBatchSync(tokenClient);
      setSyncMessage(result.message);

      if (result.status === 'AUTH_REQUIRED') {
        setAppState('AUTH_PENDING');
      }
    } catch (error) {
      console.error(error);
      setSyncMessage('Error al sincronizar. Inténtelo nuevamente.');
    } finally {
      setIsSyncing(false);
    }
  };

  // Dev simulation: bypass Picker, seed mock data, and jump to READY_EMPTY.
  const handleSimulateDriveDownload = async () => {
    try {
      const mockRows = [
        [
          'DOCUMENTO DE IDENTIDAD DEL VISITANTE',
          'APELLIDOS Y NOMBRES COMPLETOS DEL VISITANTE (MAYÚSCULA)',
          'APELLIDOS Y NOMBRES COMPLETOS DEL ADOLESCENTE (MAYÚSCULA)',
          'DOCUMENTO DE IDENTIDAD DEL ADOLESCENTE',
          'EDAD DEL VISITANTE',
          'PARENTESCO CON EL ADOLESCENTE',
          'TIPO DE VISITA',
          'DEPARTAMENTO DE RESIDENCIA DEL VISITANTE',
          'PROVINCIA DE RESIDENCIA DEL VISITANTE',
          'DISTRITO DE RESIDENCIA DEL VISITANTE',
        ],
        ...mockData.map((v) => [
          v.visitorId,
          v.visitorName,
          v.hostName,
          v.hostId,
          v.visitorAge,
          v.relationship,
          v.visitType,
          v.visitorDept,
          v.visitorProv,
          v.visitorDist,
        ]),
      ];
      await ingestRowsToIndexedDB(mockRows, 'mock_master_sheet_id', 'mock_cloned_sheet_id_999');
      await refreshVisitors();
    } catch (error) {
      console.error(error);
      alert('No se pudo simular la descarga de Drive');
    }
  };

  // Dev simulation: mark all unsynced check-ins as synced without a real network call.
  const handleSimulateSyncBatch = async () => {
    try {
      const allVisitors = await getAllVisitors();
      const pending = allVisitors.filter(
        (v) => v.attendanceStatus === true && v.syncedWithCloud === false,
      );

      if (pending.length === 0) {
        alert('Simulación: No hay registros pendientes de sincronizar.');
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, 1000));

      const db = await getDB();
      const tx = db.transaction(['visitorStore'], 'readwrite');
      const store = tx.objectStore('visitorStore');

      for (const record of pending) {
        await store.put({ ...record, syncedWithCloud: true });
      }

      await tx.done;
      alert(`Simulación: ${pending.length} registros marcados como sincronizados.`);
    } catch (error) {
      console.error(error);
      alert('No se pudo simular la sincronización');
    }
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
          isPickerLoading={isPickerLoading}
          onSyncWithDrive={handleSyncWithDrive}
          isOffline={isOffline}
          isSyncing={isSyncing}
          syncMessage={syncMessage}
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
        onSimulateDriveDownload={handleSimulateDriveDownload}
        onSimulateSyncBatch={handleSimulateSyncBatch}
        defaultScanValue={mockData[0]?.visitorId ?? '12345678'}
      />
    </main>
  );
}
