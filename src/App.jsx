import { useEffect, useState } from 'react';
import Header from './components/Header';
import Zone1Scanner from './components/Zone1Scanner';
import Zone2Search from './components/Zone2Search';
import Zone3Actions from './components/Zone3Actions';
import DevStateControls from './components/DevStateControls';
import mockData from './db/mockData';
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
  };

  useEffect(() => {
    refreshVisitors();
  }, []);

  useEffect(() => {
    const result = executeSearch(searchQuery, visitorList);
    setSearchStatus(result.status);
    setSearchResults(result.data ?? []);
    setSearchMessage(result.message ?? '');
  }, [searchQuery, visitorList]);

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
      setAppState('READY_EMPTY');
    } catch (error) {
      console.error(error);
      alert('No se pudo limpiar la base de datos');
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
        defaultScanValue={mockData[0]?.visitorId ?? '12345678'}
      />
    </main>
  );
}
