import React from 'react';

const ImageModal = ({ image, onClose }) => {
  if (!image) return null;

  const getProxyUrl = (originalUrl) => {
    return `/api/proxy-image?url=${encodeURIComponent(originalUrl)}`;
  };

  const formatTimestamp = (timestamp) => {
    const date = new Date(timestamp);
    
    const localTime = date.toLocaleString('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
    
    const utcTime = date.toLocaleString('en-US', {
      timeZone: 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
    
    return {
      local: localTime + ' (Local)',
      utc: utcTime + ' (UTC)',
      original: timestamp
    };
  };

  const timestamps = formatTimestamp(image.timestamp);

  return (
    <div className="image-modal-overlay" onClick={onClose}>
      <div className="image-modal-content" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>×</button>
        <img 
          src={getProxyUrl(image.url)} 
          alt={`Snapshot from ${image.node}`}
        />
        <div className="modal-info">
          <h3>Image Details</h3>
          <p><strong>Node:</strong> {image.node}</p>
          <p><strong>Filename:</strong> {image.filename}</p>
          <p><strong>Local Time:</strong> {timestamps.local}</p>
          <p><strong>UTC Time:</strong> {timestamps.utc}</p>
          <p><strong>Raw Timestamp:</strong> <code style={{ fontSize: '0.8em', backgroundColor: '#f0f0f0', padding: '2px 4px' }}>{timestamps.original}</code></p>
          {image.models_results && Object.keys(image.models_results).length > 0 && (
            <div style={{ marginTop: '15px' }}>
              <p><strong>Detection Models:</strong></p>
              {Object.entries(image.models_results).map(([model, results]) => (
                <div key={model} style={{ marginLeft: '10px', fontSize: '0.9em' }}>
                  <strong>{model}:</strong> {results.total_objects || 0} objects detected
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ImageModal;