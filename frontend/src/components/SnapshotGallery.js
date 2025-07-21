import React, { useState } from 'react';
import { COLORS } from './styles/colors';
import ImageModal from './ImageModal';

const SnapshotGallery = ({ images = [] }) => {
  const [selectedImage, setSelectedImage] = useState(null);

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

  return (
    <>
      <div className="snapshot-gallery">
        {images.length === 0 ? (
          <div className="empty-state">
            <h1>Snapshot Gallery</h1>
            <p className="placeholder-text">Query data to see snapshots</p>
          </div>
        ) : (
          <div className="gallery-grid">
            {images.map((image, index) => (
              <div 
                key={index} 
                className="image-card"
                onClick={() => setSelectedImage(image)}
              >
                <img 
                  src={getProxyUrl(image.url)} 
                  alt={`Snapshot from ${image.node}`}
                  loading="lazy"
                  onError={(e) => {
                    console.error('Image failed to load:', image.url);
                    e.target.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgZmlsbD0iI2RkZCIvPjx0ZXh0IHRleHQtYW5jaG9yPSJtaWRkbGUiIHg9IjEwMCIgeT0iMTAwIiBzdHlsZT0iZmlsbDojOTk5O2ZvbnQtd2VpZ2h0OmJvbGQ7Zm9udC1zaXplOjEycHg7Zm9udC1mYW1pbHk6QXJpYWwsSGVsdmV0aWNhLHNhbnMtc2VyaWY7ZG9taW5hbnQtYmFzZWxpbmU6Y2VudHJhbCI+SW1hZ2UgTm90IEF2YWlsYWJsZTwvdGV4dD48L3N2Zz4=';
                  }}
                />
                <div className="image-info">
                  <span className="node-badge" style={{ backgroundColor: COLORS.sage }}>{image.node}</span>
                  <span className="timestamp" title={`Original: ${image.timestamp}`}>
                    {formatTimestamp(image.timestamp)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      
      <ImageModal 
        image={selectedImage} 
        onClose={() => setSelectedImage(null)} 
      />
    </>
  );
};

export default SnapshotGallery;