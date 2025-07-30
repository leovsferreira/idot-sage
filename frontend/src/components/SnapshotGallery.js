import React, { useState, useRef, useEffect } from 'react';
import { COLORS } from './styles/colors';
import ImageModal from './ImageModal';

const SnapshotGallery = ({ images = [], selectedModels = [] }) => {
  const [selectedImage, setSelectedImage] = useState(null);
  const [showDetections, setShowDetections] = useState({});
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const modelColors = {
    'YOLOv5n': '#FF6B6B',
    'YOLOv8n': '#4ECDC4', 
    'YOLOv10n': '#45B7D1'
  };

  const allModels = ['YOLOv5n', 'YOLOv8n', 'YOLOv10n'];

  const modelsWithData = React.useMemo(() => {
    const modelsFound = new Set();
    images.forEach(image => {
      if (image.models_results) {
        Object.keys(image.models_results).forEach(model => {
          modelsFound.add(model);
        });
      }
    });
    return Array.from(modelsFound);
  }, [images]);

  const getProxyUrl = (originalUrl) => {
    return `/api/proxy-image?url=${encodeURIComponent(originalUrl)}`;
  };

  const formatTimestamp = (timestamp) => {
    const date = new Date(timestamp);
    
    return date.toLocaleString('en-US', {
      timeZone: 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    }) + ' UTC';
  };

  const handleDetectionToggle = (model) => {
    setShowDetections(prev => ({
      ...prev,
      [model]: !prev[model]
    }));
  };

  const ImageWithDetections = ({ image, index }) => {
    const canvasRef = useRef(null);
    const imgRef = useRef(null);
    const [imageLoaded, setImageLoaded] = useState(false);
    const [imageDimensions, setImageDimensions] = useState({ width: 0, height: 0 });

    useEffect(() => {
      if (imageLoaded && canvasRef.current && imgRef.current) {
        drawDetections();
      }
    }, [imageLoaded, showDetections, imageDimensions]);

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
      
      // Set canvas size to match displayed image
      canvas.width = rect.width;
      canvas.height = rect.height;
      
      // Clear canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Calculate scale factors
      const scaleX = rect.width / imageDimensions.width;
      const scaleY = rect.height / imageDimensions.height;

      // Draw detections for each active model
      Object.keys(showDetections).forEach(model => {
        if (showDetections[model] && image.models_results[model]?.detections) {
          const detections = image.models_results[model].detections;
          const color = modelColors[model];
          
          detections.forEach((detection, detIndex) => {
            const [x1, y1, x2, y2] = detection.bbox;
            
            // Scale coordinates to canvas
            const canvasX1 = x1 * scaleX;
            const canvasY1 = y1 * scaleY;
            const canvasX2 = x2 * scaleX;
            const canvasY2 = y2 * scaleY;
            
            // Draw bounding box
            ctx.strokeStyle = color;
            ctx.lineWidth = 2;
            ctx.setLineDash([]);
            ctx.strokeRect(canvasX1, canvasY1, canvasX2 - canvasX1, canvasY2 - canvasY1);
            
            // Draw label background
            const label = `${detection.class} (${(detection.confidence * 100).toFixed(1)}%)`;
            ctx.font = '12px Arial';
            const textMetrics = ctx.measureText(label);
            const textWidth = textMetrics.width;
            const textHeight = 16;
            
            // Label background
            ctx.fillStyle = color;
            ctx.fillRect(canvasX1, canvasY1 - textHeight - 2, textWidth + 8, textHeight + 4);
            
            // Label text
            ctx.fillStyle = 'white';
            ctx.fillText(label, canvasX1 + 4, canvasY1 - 4);
          });
        }
      });
    };

    return (
      <div 
        className="image-card"
        onClick={() => setSelectedImage(image)}
        style={{ position: 'relative' }}
      >
        <div style={{ position: 'relative', overflow: 'hidden' }}>
          <img 
            ref={imgRef}
            src={getProxyUrl(image.url)} 
            alt={`Snapshot from ${image.node}`}
            loading="lazy"
            onLoad={handleImageLoad}
            onError={(e) => {
              console.error('Image failed to load:', image.url);
              e.target.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgZmlsbD0iI2RkZCIvPjx0ZXh0IHRleHQtYW5jaG9yPSJtaWRkbGUiIHg9IjEwMCIgeT0iMTAwIiBzdHlsZT0iZmlsbDojOTk5O2ZvbnQtd2VpZ2h0OmJvbGQ7Zm9udC1zaXplOjEycHg7Zm9udC1mYW1pbHk6QXJpYWwsSGVsdmV0aWNhLHNhbnMtc2VyaWY7ZG9taW5hbnQtYmFzZWxpbmU6Y2VudHJhbCI+SW1hZ2UgTm90IEF2YWlsYWJsZTwvdGV4dD48L3N2Zz4=';
            }}
            style={{
              width: '100%',
              height: '200px',
              objectFit: 'cover',
              backgroundColor: '#f0f0f0'
            }}
          />
          <canvas
            ref={canvasRef}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '200px',
              pointerEvents: 'none'
            }}
          />
        </div>
        <div className="image-info">
          <span className="node-badge" style={{ backgroundColor: COLORS.sage }}>{image.node}</span>
          <span className="timestamp" title={`Original: ${image.timestamp}`}>
            {formatTimestamp(image.timestamp)}
          </span>
        </div>
      </div>
    );
  };

  return (
    <>
      <div className="snapshot-gallery">
        {images.length === 0 ? (
          <div className="empty-state">
            <h1>Snapshot Gallery</h1>
            <p className="placeholder-text">Query data to see snapshots</p>
          </div>
        ) : (
          <>
            {/* Detection Controls */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '20px',
              padding: '10px 0',
              borderBottom: '1px solid #e0e0e0'
            }}>
              <h2 style={{ 
                color: '#2c3e50', 
                fontSize: '1.5rem', 
                fontWeight: '300', 
                margin: 0 
              }}>
                Snapshot Gallery ({images.length} images)
              </h2>
              
              <div style={{ position: 'relative' }}>
                <button
                  onClick={() => setDropdownOpen(!dropdownOpen)}
                  style={{
                    backgroundColor: '#f8f9fa',
                    border: '1px solid #dee2e6',
                    borderRadius: '6px',
                    padding: '8px 16px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}
                >
                  Show Detections
                  <span style={{ fontSize: '12px' }}>▼</span>
                </button>
                
                {dropdownOpen && (
                  <div style={{
                    position: 'absolute',
                    top: '100%',
                    right: 0,
                    backgroundColor: 'white',
                    border: '1px solid #dee2e6',
                    borderRadius: '6px',
                    boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
                    padding: '10px',
                    minWidth: '200px',
                    zIndex: 1000
                  }}>
                    {allModels.map(model => {
                      const isAvailable = modelsWithData.includes(model);
                      const isChecked = showDetections[model] || false;
                      
                      return (
                        <label
                          key={model}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            padding: '6px 0',
                            cursor: isAvailable ? 'pointer' : 'not-allowed',
                            opacity: isAvailable ? 1 : 0.5,
                            fontSize: '14px'
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            disabled={!isAvailable}
                            onChange={() => isAvailable && handleDetectionToggle(model)}
                            style={{ marginRight: '4px' }}
                          />
                          <div
                            style={{
                              width: '12px',
                              height: '12px',
                              backgroundColor: modelColors[model],
                              borderRadius: '2px',
                              opacity: isAvailable ? 1 : 0.3
                            }}
                          />
                          {model}
                          {!isAvailable && (
                            <span style={{ 
                              fontSize: '12px', 
                              color: '#6c757d',
                              fontStyle: 'italic'
                            }}>
                              (no data)
                            </span>
                          )}
                        </label>
                      );
                    })}
                    
                    {Object.keys(showDetections).length > 0 && (
                      <div style={{
                        borderTop: '1px solid #e9ecef',
                        paddingTop: '8px',
                        marginTop: '8px'
                      }}>
                        <button
                          onClick={() => setShowDetections({})}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: '#dc3545',
                            fontSize: '12px',
                            cursor: 'pointer',
                            textDecoration: 'underline'
                          }}
                        >
                          Clear all
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="gallery-grid">
              {images.map((image, index) => (
                <ImageWithDetections 
                  key={index} 
                  image={image} 
                  index={index}
                />
              ))}
            </div>
          </>
        )}
      </div>
      
      <ImageModal 
        image={selectedImage} 
        onClose={() => setSelectedImage(null)}
        showDetections={showDetections}
        selectedModels={selectedModels}
      />
    </>
  );
};

export default SnapshotGallery;