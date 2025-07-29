import React, { useState, useEffect } from 'react';
import SnapshotGallery from './components/SnapshotGallery';
import D3Timeline from './components/Timeline';
import LateralMenu from './components/LateralMenu';
import './App.css';

function App() {
  const [activeTab, setActiveTab] = useState('filter');
  const [backendStatus, setBackendStatus] = useState('checking');
  const [queryResults, setQueryResults] = useState([]);
  const [selectedModels, setSelectedModels] = useState(['YOLOv8n']);

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

  const handleModelChange = (model) => {
    setSelectedModels(prev => {
      if (prev.includes(model)) {
        return prev.filter(m => m !== model);
      } else {
        return [...prev, model];
      }
    });
  };

  const galleryImages = queryResults.filter(image => image.has_image !== false);
  
  const savedImagesCount = galleryImages.length;
  const inferenceOnlyCount = queryResults.length - savedImagesCount;

  return (
    <div className="app">
      <div className="status-bar">
        Backend: <span className={`status ${backendStatus}`}>{backendStatus}</span>
        {queryResults.length > 0 && (
          <span className="result-count">
            | {savedImagesCount} saved images
            {inferenceOnlyCount > 0 && `, ${inferenceOnlyCount} inference-only`}
            {` (${queryResults.length} total records)`}
          </span>
        )}
      </div>
      
      <div className="main-container">
        <div className="content-area">
          {/* Gallery shows only saved images */}
          <SnapshotGallery images={galleryImages} />
          {/* Timeline shows ALL data (saved images + inference-only) */}
          <D3Timeline images={queryResults} selectedModels={selectedModels} />
        </div>
        <LateralMenu 
          activeTab={activeTab} 
          setActiveTab={setActiveTab}
          onQueryResults={handleQueryResults}
          onModelChange={handleModelChange}
          selectedModels={selectedModels}
        />
      </div>
    </div>
  );
}

export default App;