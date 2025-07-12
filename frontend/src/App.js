import React, { useState, useEffect } from 'react';
import SnapshotGallery from './components/SnapshotGallery';
import Timeline from './components/Timeline';
import LateralMenu from './components/LateralMenu';
import './App.css';

function App() {
  const [activeTab, setActiveTab] = useState('filter');
  const [backendStatus, setBackendStatus] = useState('checking');
  const [queryResults, setQueryResults] = useState([]);

  useEffect(() => {
    fetch('/api/health')
      .then(res => res.json())
      .then(data => {
        console.log('Backend status:', data);
        setBackendStatus('connected');
      })
      .catch(err => {
        console.error('Backend connection error:', err);
        setBackendStatus('disconnected');
      });
  }, []);

  const handleQueryResults = (images) => {
    setQueryResults(images);
  };

  return (
    <div className="app">
      <div className="status-bar">
        Backend: <span className={`status ${backendStatus}`}>{backendStatus}</span>
        {queryResults.length > 0 && (
          <span className="result-count"> | {queryResults.length} images found</span>
        )}
      </div>
      
      <div className="main-container">
        <div className="content-area">
          <SnapshotGallery images={queryResults} />
          <Timeline images={queryResults} />
        </div>
        <LateralMenu 
          activeTab={activeTab} 
          setActiveTab={setActiveTab}
          onQueryResults={handleQueryResults}
        />
      </div>
    </div>
  );
}

export default App;