import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { COLORS } from './styles/colors';

const Timeline = ({ images = [], selectedModels = [] }) => {
  const svgRef = useRef(null);
  const containerRef = useRef(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 400 });
  const [zoomLevel, setZoomLevel] = useState(1);
  const [tooltip, setTooltip] = useState({ visible: false, x: 0, y: 0, content: '' });

  const modelColors = {
    'YOLOv5n': '#FF6B6B',
    'YOLOv8n': '#4ECDC4',
    'YOLOv10n': '#45B7D1'
  };

  const processData = () => {
    const dataByDay = {};
    
    images.forEach(image => {
      if (!image.models_results) return;
      
      const date = new Date(image.timestamp);
      
      const year = date.getUTCFullYear();
      const month = String(date.getUTCMonth() + 1).padStart(2, '0');
      const day = String(date.getUTCDate()).padStart(2, '0');
      const dayKey = `${year}-${month}-${day}`;
      
      const hour = date.getUTCHours();
      const minutes = date.getUTCMinutes();
      const hourFloat = hour + minutes / 60;
      
      if (!dataByDay[dayKey]) {
        dataByDay[dayKey] = [];
      }
      
      selectedModels.forEach(model => {
        if (image.models_results[model]) {
          dataByDay[dayKey].push({
            hour: hourFloat,
            model: model,
            timestamp: image.timestamp,
            detections: image.models_results[model].detections || [],
            counts: image.models_results[model].counts || {},
            totalObjects: image.models_results[model].total_objects || 0,
            inferenceTime: image.models_results[model].inference_time_seconds || 0,
            imageUrl: image.url
          });
        }
      });
    });
    
    return dataByDay;
  };

  useEffect(() => {
    if (!containerRef.current || images.length === 0 || selectedModels.length === 0) return;

    const container = containerRef.current;
    const containerRect = container.getBoundingClientRect();
    const width = containerRect.width - 40;
    const height = Math.max(200, containerRect.height - 80);
    
    setDimensions({ width, height });

    const dataByDay = processData();
    const days = Object.keys(dataByDay).sort();
    
    if (days.length === 0) return;

    d3.select(svgRef.current).selectAll("*").remove();

    const svg = d3.select(svgRef.current)
      .attr('width', width)
      .attr('height', height);

    const margin = { top: 30, right: 20, bottom: 20, left: 100 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    const g = svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    const xScale = d3.scaleLinear()
      .domain([0, 24])
      .range([0, innerWidth]);

    const yScale = d3.scaleBand()
      .domain(days)
      .range([0, innerHeight])
      .padding(0.2);

    const thicknessScale = d3.scaleLinear()
      .domain([0, d3.max(Object.values(dataByDay).flat(), d => d.totalObjects)])
      .range([2, Math.min(yScale.bandwidth(), 20)]);

    const zoomContainer = g.append('g')
      .attr('class', 'zoom-container');
    
    const xAxis = d3.axisTop(xScale)
      .tickValues(d3.range(0, 25, 2))
      .tickFormat(d => `${d.toString().padStart(2, '0')}:00`);
    
    g.append('g')
      .attr('class', 'x-axis')
      .call(xAxis)
      .style('font-size', '10px');
    
    g.append('g')
      .attr('class', 'y-axis')
      .selectAll('text')
      .data(days)
      .enter()
      .append('text')
      .attr('x', -10)
      .attr('y', d => yScale(d) + yScale.bandwidth() / 2)
      .attr('text-anchor', 'end')
      .attr('alignment-baseline', 'middle')
      .style('font-size', '12px')
      .style('font-weight', 'bold')
      .style('fill', '#2c3e50')
      .text(d => {
        const parts = d.split('-');
        const year = parseInt(parts[0]);
        const month = parseInt(parts[1]) - 1;
        const day = parseInt(parts[2]);
        const date = new Date(Date.UTC(year, month, day));
        
        return date.toLocaleDateString('en-US', { 
          timeZone: 'UTC',
          month: 'short', 
          day: 'numeric'
        });
      });
    
    days.forEach(day => {
      const dayData = dataByDay[day];
      
      zoomContainer.append('line')
        .attr('x1', 0)
        .attr('x2', innerWidth)
        .attr('y1', yScale(day) + yScale.bandwidth() / 2)
        .attr('y2', yScale(day) + yScale.bandwidth() / 2)
        .attr('stroke', '#e0e0e0')
        .attr('stroke-width', 1);
      
      dayData.forEach(detection => {
        const thickness = thicknessScale(detection.totalObjects);
        
        zoomContainer.append('rect')
          .attr('x', xScale(detection.hour) - 2)
          .attr('y', yScale(day) + (yScale.bandwidth() - thickness) / 2)
          .attr('width', 4)
          .attr('height', thickness)
          .attr('fill', modelColors[detection.model])
          .attr('opacity', 0.8)
          .attr('cursor', 'pointer')
          .on('mouseover', function(event) {
            const classes = Object.entries(detection.counts)
              .map(([cls, count]) => `${cls}: ${count}`)
              .join(', ');
            
            const content = `
              Model: ${detection.model}
              Time: ${new Date(detection.timestamp).toLocaleString('en-US', { 
                timeZone: 'UTC', 
                hour12: false 
              })} UTC
              Detected: ${classes || 'None'}
              Total Objects: ${detection.totalObjects}
              Inference Time: ${detection.inferenceTime.toFixed(2)}s
            `;
            
            setTooltip({
              visible: true,
              x: event.pageX + 10,
              y: event.pageY - 10,
              content
            });
          })
          .on('mouseout', () => {
            setTooltip({ visible: false, x: 0, y: 0, content: '' });
          });
      });
    });
    
    for (let hour = 0; hour <= 24; hour += 4) {
      zoomContainer.append('line')
        .attr('x1', xScale(hour))
        .attr('x2', xScale(hour))
        .attr('y1', 0)
        .attr('y2', innerHeight)
        .attr('stroke', '#f0f0f0')
        .attr('stroke-width', 1);
    }
    
    const zoom = d3.zoom()
      .scaleExtent([1, 10])
      .translateExtent([[0, 0], [innerWidth * 10, innerHeight]])
      .extent([[0, 0], [innerWidth, innerHeight]])
      .on('zoom', (event) => {
        zoomContainer.attr('transform', event.transform);
        setZoomLevel(event.transform.k);
        
        const newXScale = event.transform.rescaleX(xScale);
        g.select('.x-axis').call(
          d3.axisTop(newXScale)
            .tickValues(d3.range(0, 25, Math.max(1, Math.floor(2 / event.transform.k))))
            .tickFormat(d => `${d.toString().padStart(2, '0')}:00`)
        );
      });
    
    svg.call(zoom)
      .on('wheel.zoom', function(event) {
        if (event.shiftKey) {
          const currentTransform = d3.zoomTransform(this);
          const k = currentTransform.k * (event.deltaY > 0 ? 0.9 : 1.1);
          const transform = currentTransform.scale(k);
          svg.transition().duration(200).call(zoom.transform, transform);
        } else {
          event.stopPropagation();
        }
        event.preventDefault();
      });
    
  }, [images, dimensions, selectedModels, zoomLevel]);

  const totalImages = images.length;
  const dateRange = images.length > 0 ? {
    start: new Date(Math.min(...images.map(img => new Date(img.timestamp)))),
    end: new Date(Math.max(...images.map(img => new Date(img.timestamp))))
  } : null;

  return (
    <div 
      ref={containerRef}
      className="d3-timeline-container" 
      style={{ 
        height: '30vh',
        backgroundColor: COLORS.blueGray,
        borderRadius: '12px',
        padding: '20px',
        position: 'relative',
        overflow: 'hidden'
      }}
    >
      <div className="timeline-header" style={{ marginBottom: '10px' }}>
        <h2 style={{ margin: 0, color: '#2c3e50', fontSize: '1.2rem' }}>
          Timeline Visualization
        </h2>
        <div style={{ fontSize: '0.8rem', color: '#5a6c7d', marginTop: '5px' }}>
          {totalImages} images • {selectedModels.length} model{selectedModels.length !== 1 ? 's' : ''} • 
          {dateRange && (
            <span>
              {dateRange.start.toLocaleDateString('en-US', { timeZone: 'UTC' })} - {dateRange.end.toLocaleDateString('en-US', { timeZone: 'UTC' })} (UTC)
            </span>
          )}
          <br/>
          Hold Shift + Scroll to zoom
        </div>
      </div>
      
      <svg 
        ref={svgRef}
        style={{ 
          width: '100%', 
          height: 'calc(100% - 50px)',
          cursor: 'grab'
        }}
      />
      
      {/* Tooltip */}
      {tooltip.visible && (
        <div
          style={{
            position: 'fixed',
            left: tooltip.x,
            top: tooltip.y,
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            color: 'white',
            padding: '8px 12px',
            borderRadius: '4px',
            fontSize: '12px',
            whiteSpace: 'pre-line',
            pointerEvents: 'none',
            zIndex: 1000,
            maxWidth: '200px'
          }}
        >
          {tooltip.content}
        </div>
      )}
      
      {/* Model Legend */}
      <div style={{ 
        position: 'absolute',
        bottom: '10px',
        right: '10px',
        display: 'flex',
        gap: '10px',
        fontSize: '11px'
      }}>
        {selectedModels.map(model => (
          <div key={model} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <div 
              style={{
                width: '12px',
                height: '12px',
                backgroundColor: modelColors[model],
                borderRadius: '2px'
              }}
            />
            <span style={{ color: '#5a6c7d' }}>{model}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Timeline;