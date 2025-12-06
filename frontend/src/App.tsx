import React from 'react';
import TacticsBoard from './components/TacticsBoard/TacticsBoard';
import ErrorBoundary from './components/ErrorBoundary';

function App() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <main style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', background: '#6e8c5e' }}>
        <ErrorBoundary>
          <TacticsBoard />
        </ErrorBoundary>
      </main>
    </div>
  );
}

export default App;