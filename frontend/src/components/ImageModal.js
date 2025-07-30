import React, { useRef, useEffect, useState } from 'react';

const ImageModal = ({ image, onClose, showDetections = {}, selectedModels = [] }) => {
  const canvasRef = useRef(null);
  const imgRef = useRef(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageDimensions, setImageDimensions] = useState({ width: 0, height: 0 });
  const [localShowDetections, setLocalShowDetections] = useState({});
  const [activeModel, setActiveModel] = useState('');

  const modelColors = {
    'YOLOv5n': '#FF6B6B',
    'YOLOv8n': '#4ECDC4',
    'YOLOv10n': '#45B7D1'
  };

  useEffect(() => {
    if (image && imageLoaded && canvasRef.current && imgRef.current) {
      drawDetections();
    } else if (canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d');
      ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    }
  }, [imageLoaded, showDetections, localShowDetections, imageDimensions, image]);

  useEffect(() => {
    setLocalShowDetections(showDetections);
  }, [showDetections]);

  useEffect(() => {
    if (image) {
      setImageLoaded(false);
      setActiveModel('');
      setImageDimensions({ width: 0, height: 0 });
      setLocalShowDetections(showDetections);
    }
  }, [image, showDetections]);

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

  const handleImageLoad = () => {
    if (imgRef.current) {
      const img = imgRef.current;
      setImageDimensions({
        width: img.naturalWidth,
        height: img.naturalHeight
      });
      setImageLoaded(true);
    }
  };

  const drawDetections = () => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img || !image.models_results) return;

    const ctx = canvas.getContext('2d');
    const rect = img.getBoundingClientRect();
    
    canvas.width = rect.width;
    canvas.height = rect.height;
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const scaleX = rect.width / imageDimensions.width;
    const scaleY = rect.height / imageDimensions.height;

    Object.keys(localShowDetections).forEach(model => {
      if (localShowDetections[model] && image.models_results[model]?.detections) {
        const detections = image.models_results[model].detections;
        const color = modelColors[model];
        
        detections.forEach((detection) => {
          const [x1, y1, x2, y2] = detection.bbox;
          
          const canvasX1 = x1 * scaleX;
          const canvasY1 = y1 * scaleY;
          const canvasX2 = x2 * scaleX;
          const canvasY2 = y2 * scaleY;
          
          ctx.strokeStyle = color;
          ctx.lineWidth = 3;
          ctx.setLineDash([]);
          ctx.strokeRect(canvasX1, canvasY1, canvasX2 - canvasX1, canvasY2 - canvasY1);
          
          const label = `${detection.class} (${(detection.confidence * 100).toFixed(1)}%)`;
          ctx.font = '16px Arial';
          const textMetrics = ctx.measureText(label);
          const textWidth = textMetrics.width;
          const textHeight = 20;
          
          ctx.fillStyle = color;
          ctx.fillRect(canvasX1, canvasY1 - textHeight - 4, textWidth + 12, textHeight + 8);
          
          ctx.fillStyle = 'white';
          ctx.font = 'bold 16px Arial';
          ctx.fillText(label, canvasX1 + 6, canvasY1 - 6);
        });
      }
    });
  };

  const timestamps = formatTimestamp(image.timestamp);
  const availableModels = image.models_results ? Object.keys(image.models_results) : [];
  const hasAnyDetectionsEnabled = Object.values(localShowDetections).some(enabled => enabled);

  const handleDetectionToggle = (model) => {
    setLocalShowDetections(prev => ({
      ...prev,
      [model]: !prev[model]
    }));
  };

  return (
    <div className="image-modal-overlay" onClick={onClose}>
      <div className="image-modal-content" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>×</button>
        
        <div style={{ position: 'relative', display: 'inline-block' }}>
          <img 
            ref={imgRef}
            src={getProxyUrl(image.url)} 
            alt={`Snapshot from ${image.node}`}
            onLoad={handleImageLoad}
            style={{ maxWidth: '100%', maxHeight: '70vh', objectFit: 'contain' }}
          />
          <canvas
            ref={canvasRef}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              pointerEvents: 'none'
            }}
          />
        </div>
        
        <div className="modal-info">
          <div className="modal-info-content">
            <div className="modal-header">
              <h3>Image Details</h3>
              
              {availableModels.length > 0 && (
                <div className="modal-detection-controls">
                  <div className="modal-detection-hint">
                    {hasAnyDetectionsEnabled ? 'Detections enabled (matches gallery)' : 'Toggle detections for this image'}
                  </div>
                  
                  <div className="modal-detection-toggles">
                    {availableModels.map(model => {
                      const isAvailable = selectedModels.includes(model);
                      const isChecked = localShowDetections[model] || false;
                      
                      return (
                        <label
                          key={model}
                          className={`modal-detection-label ${isChecked ? 'checked' : ''}`}
                          style={{
                            cursor: isAvailable ? 'pointer' : 'not-allowed',
                            opacity: isAvailable ? 1 : 0.5,
                            borderColor: isChecked ? modelColors[model] : 'transparent'
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            disabled={!isAvailable}
                            onChange={() => isAvailable && handleDetectionToggle(model)}
                            className="modal-detection-checkbox"
                          />
                          <div
                            className="modal-detection-color"
                            style={{
                              backgroundColor: modelColors[model],
                              opacity: isAvailable ? 1 : 0.3
                            }}
                          />
                          <span className="modal-detection-name">{model}</span>
                          {!isAvailable && (
                            <span className="modal-detection-unavailable">
                              (not queried)
                            </span>
                          )}
                        </label>
                      );
                    })}
                  </div>
                  
                  {hasAnyDetectionsEnabled && (
                    <button
                      onClick={() => setLocalShowDetections({})}
                      className="modal-clear-button"
                    >
                      Clear all
                    </button>
                  )}
                </div>
              )}
            </div>

            <div>
              <p><strong>Node:</strong> {image.node}</p>
              <p><strong>Filename:</strong> {image.filename}</p>
              <p><strong>Local Time:</strong> {timestamps.local}</p>
              <p><strong>UTC Time:</strong> {timestamps.utc}</p>
              <p><strong>Raw Timestamp:</strong> <code style={{ fontSize: '0.8em', backgroundColor: '#f0f0f0', padding: '2px 4px' }}>{timestamps.original}</code></p>
            </div>

            {image.models_results && Object.keys(image.models_results).length > 0 && (
              <div className="modal-detection-results">
                <p><strong>Detection Results:</strong></p>
                {Object.entries(image.models_results).map(([model, results]) => (
                  <div 
                    key={model} 
                    className={`modal-detection-result-item ${localShowDetections[model] ? 'active' : ''}`}
                    style={{
                      borderLeftColor: localShowDetections[model] ? modelColors[model] : '#f0f0f0'
                    }}
                  >
                    <div className="modal-detection-result-header">
                      <div
                        style={{
                          width: '12px',
                          height: '12px',
                          backgroundColor: modelColors[model],
                          borderRadius: '2px'
                        }}
                      />
                      <span>{model}: {results.total_objects || 0} objects detected</span>
                    </div>
                    
                    {results.detections && results.detections.length > 0 && (
                      <div className="modal-detection-result-counts">
                        {Object.entries(results.counts || {}).map(([className, count]) => (
                          <span key={className} className="modal-detection-count-item">
                            {className}: {count}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ImageModal;