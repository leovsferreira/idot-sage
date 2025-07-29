import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as d3 from 'd3';
import { COLORS } from './styles/colors';

const Timeline = ({ images = [], selectedModels = [] }) => {
  const svgRef = useRef(null);
  const containerRef = useRef(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 400 });
  const [tooltip, setTooltip] = useState({ visible: false, x: 0, y: 0, content: '' });

  const modelColors = {
    'YOLOv5n': '#FF6B6B',
    'YOLOv8n': '#4ECDC4',
    'YOLOv10n': '#45B7D1'
  };

  const processData = useCallback(() => {
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
            totalObjects: image.models_results[model].total_objects || 0,
            timestamp: image.timestamp,
            counts: image.models_results[model].counts || {},
            hasImage: image.has_image || false, 
            filename: image.filename,
            node: image.node
          });
        }
      });
    });
    
    return dataByDay;
  }, [images, selectedModels]);

  const updateDimensions = useCallback(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;
    const { width, height } = container.getBoundingClientRect();
    setDimensions({ width: width - 40, height: Math.max(200, height - 80) });
  }, []);

  useEffect(() => {
    updateDimensions();
    const handleResize = () => updateDimensions();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [updateDimensions]);

  useEffect(() => {
    if (!containerRef.current || images.length === 0 || selectedModels.length === 0) return;
    const dataByDay = processData();
    const days = Object.keys(dataByDay).sort();
    if (days.length === 0) return;

    d3.select(svgRef.current).selectAll('*').remove();
    const { width, height } = dimensions;
    const margin = { top: 30, right: 20, bottom: 20, left: 100 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    const svg = d3.select(svgRef.current)
      .attr('width', width)
      .attr('height', height);

    const g = svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    const xScale = d3.scaleLinear().domain([0, 24]).range([0, innerWidth]);
    const yScale = d3.scaleBand().domain(days).range([0, innerHeight]).padding(0.2);
    const thicknessScale = d3.scaleLinear()
      .domain([0, d3.max(Object.values(dataByDay).flat(), d => d.totalObjects)])
      .range([8, Math.min(yScale.bandwidth(), 30)]);

    g.append('g')
      .attr('class', 'x-axis')
      .call(d3.axisTop(xScale).tickValues(d3.range(0, 25, 2)).tickFormat(d => `${d.toString().padStart(2, '0')}:00`))
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
        const date = new Date(Date.UTC(+parts[0], +parts[1] - 1, +parts[2]));
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
      });

    const chartContainer = g.append('g');

    days.forEach(day => {
      const dayData = dataByDay[day];
      
      chartContainer.append('line')
        .attr('x1', 0)
        .attr('x2', innerWidth)
        .attr('y1', yScale(day) + yScale.bandwidth() / 2)
        .attr('y2', yScale(day) + yScale.bandwidth() / 2)
        .attr('stroke', '#e1e4ebff')
        .attr('stroke-width', 1)
        .attr('stroke-dasharray', '4,4')
        .attr('opacity', 0.6);

      dayData.forEach(detection => {
        const thickness = thicknessScale(detection.totalObjects);
        
        chartContainer.append('rect')
          .attr('x', xScale(detection.hour) - 1)
          .attr('y', yScale(day) + (yScale.bandwidth() - thickness) / 2)
          .attr('width', 4)
          .attr('height', thickness)
          .attr('fill', modelColors[detection.model])
          .attr('opacity', detection.hasImage ? 0.8 : 0.6)
          .attr('stroke', detection.hasImage ? 'none' : '#333')
          .attr('stroke-width', detection.hasImage ? 0 : 1)
          .attr('stroke-dasharray', detection.hasImage ? 'none' : '2,2')
          .on('mouseover', function (event) {
            const classes = Object.entries(detection.counts).map(([cls, count]) => `${cls}: ${count}`).join(', ');
            const imageStatus = detection.hasImage ? 'Saved Image' : 'Inference Only';
            const content = `Model: ${detection.model}\nTime: ${new Date(detection.timestamp).toLocaleString('en-US', { timeZone: 'UTC', hour12: false })} UTC\nNode: ${detection.node}\nStatus: ${imageStatus}\nDetected: ${classes || 'None'}\nTotal Objects: ${detection.totalObjects}`;
            setTooltip({ visible: true, x: event.pageX + 10, y: event.pageY - 10, content });
          })
          .on('mouseout', () => setTooltip({ visible: false, x: 0, y: 0, content: '' }));
      });
    });

    for (let hour = 0; hour <= 24; hour += 4) {
      chartContainer.append('line')
        .attr('x1', xScale(hour))
        .attr('x2', xScale(hour))
        .attr('y1', 0)
        .attr('y2', innerHeight)
        .attr('stroke', '#e1e4ebff')
        .attr('stroke-width', 1)
        .attr('stroke-dasharray', '4,4')
        .attr('opacity', 0.6);
    }
  }, [dimensions, processData, images.length, selectedModels.length]);

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
        overflow: 'hidden',
        userSelect: 'none',
        pointerEvents: 'auto'
      }}
    >
      <svg 
        ref={svgRef} 
        style={{ 
          width: '100%', 
          height: '100%',
          cursor: 'default'
        }} 
      />

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

      {/* Legend for data types */}
      <div style={{
        position: 'absolute',
        top: '10px',
        right: '10px',
        display: 'flex',
        gap: '15px',
        fontSize: '10px',
        color: '#5a6c7d'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <div style={{
            width: '12px',
            height: '4px',
            backgroundColor: '#999',
            opacity: 0.8
          }} />
          <span>Saved Image</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <div style={{
            width: '12px',
            height: '4px',
            backgroundColor: '#999',
            opacity: 0.6,
            border: '1px dashed #333'
          }} />
          <span>Inference Only</span>
        </div>
      </div>
    </div>
  );
};

export default Timeline;