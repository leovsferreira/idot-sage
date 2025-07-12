import React from 'react';
import { COLORS } from './styles/colors';

const Timeline = ({ images = [] }) => {
  const hours = Array.from({ length: 24 }, (_, i) => i);

  const imagesByHour = {};
  images.forEach(image => {
    const hour = new Date(image.timestamp).getHours();
    if (!imagesByHour[hour]) {
      imagesByHour[hour] = [];
    }
    imagesByHour[hour].push(image);
  });

  return (
    <div className="timeline" style={{ backgroundColor: COLORS.blueGray }}>
      <div className="timeline-header">
        <h2>Timeline</h2>
        <span className="time-range">00:00 - 23:59</span>
      </div>
      <div className="timeline-track">
        {hours.map(hour => (
          <div key={hour} className="hour-marker">
            <div className="hour-label">{hour.toString().padStart(2, '0')}</div>
            {imagesByHour[hour] && (
              <div className="image-indicator" title={`${imagesByHour[hour].length} images`}>
                {imagesByHour[hour].length}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default Timeline;