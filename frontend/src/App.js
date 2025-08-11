import React, { useState, useEffect } from 'react';
import SnapshotGallery from './components/SnapshotGallery';
import D3Timeline from './components/Timeline';
import LateralMenu from './components/LateralMenu';
import { applyDetectionFilters, getFilterSummary } from './utils/trafficClasses';
import './App.css';

function App() {
  const [activeTab, setActiveTab] = useState('filter');
  const [backendStatus, setBackendStatus] = useState('checking');
  const [queryResults, setQueryResults] = useState([]);
  const [selectedModels, setSelectedModels] = useState(['YOLOv8n']);
  const [detectionFilter, setDetectionFilter] = useState(null);
  const [filteredResults, setFilteredResults] = useState([]);

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

  useEffect(() => {
    if (detectionFilter) {
      const filtered = applyDetectionFilters(queryResults, detectionFilter);
      setFilteredResults(filtered);
      console.log(`Applied detection filter: ${filtered.length}/${queryResults.length} results match filter`);
    } else {
      setFilteredResults(queryResults);
    }
  }, [queryResults, detectionFilter]);

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

  const handleDetectionFilterChange = (filterConfig) => {
    setDetectionFilter(filterConfig);
  };

  const displayResults = filteredResults;
  const galleryImages = displayResults.filter(image => image.has_image !== false);
  
  const savedImagesCount = galleryImages.length;
  const inferenceOnlyCount = displayResults.length - savedImagesCount;
  const totalOriginalCount = queryResults.length;

  return (
    <div className="app">
      <div className="status-bar">
        Backend: <span className={`status ${backendStatus}`}>{backendStatus}</span>
        {queryResults.length > 0 && (
          <span className="result-count">
            | {savedImagesCount} saved images
            {inferenceOnlyCount > 0 && `, ${inferenceOnlyCount} inference-only`}
            {detectionFilter && ` (${displayResults.length}/${totalOriginalCount} filtered)`}
            {!detectionFilter && ` (${displayResults.length} total records)`}
            {detectionFilter && (
              <span style={{ fontSize: '0.8rem', fontStyle: 'italic', marginLeft: '8px' }}>
                Filter: {getFilterSummary(detectionFilter)}
              </span>
            )}
          </span>
        )}
      </div>
      
      <div className="main-container">
        <div className="content-area">
          {/* Gallery shows only saved images from filtered results */}
          <SnapshotGallery images={galleryImages} selectedModels={selectedModels} />
          {/* Timeline shows ALL filtered data (saved images + inference-only) */}
          <D3Timeline images={displayResults} selectedModels={selectedModels} />
        </div>
        <LateralMenu 
          activeTab={activeTab} 
          setActiveTab={setActiveTab}
          onQueryResults={handleQueryResults}
          onModelChange={handleModelChange}
          selectedModels={selectedModels}
          onDetectionFilterChange={handleDetectionFilterChange}
        />
      </div>
    </div>
  );
}

export default App;