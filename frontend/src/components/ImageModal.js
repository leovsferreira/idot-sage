import React from 'react';

const ImageModal = ({ image, onClose }) => {
  if (!image) return null;

  const getProxyUrl = (originalUrl) => {
    return `/api/proxy-image?url=${encodeURIComponent(originalUrl)}`;
  };

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
          <p><strong>Timestamp:</strong> {new Date(image.timestamp).toLocaleString()}</p>
        </div>
      </div>
    </div>
  );
};

export default ImageModal;