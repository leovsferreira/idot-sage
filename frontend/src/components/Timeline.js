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
      const dayKey = date.toISOString().split('T')[0];
      const hour = date.getHours();
      const minutes = date.getMinutes();
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
            inferenceTime: image.models_results[model].inference_time_seconds || 0
          });
        }
      });
    });
    
    return dataByDay;
  };

  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        const { width } = containerRef.current.getBoundingClientRect();
        setDimensions({ width, height: window.innerHeight * 0.3 });
      }
    };

    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, []);

  useEffect(() => {
    if (!svgRef.current || images.length === 0 || selectedModels.length === 0) return;

    const dataByDay = processData();
    const days = Object.keys(dataByDay).sort();
    
    const margin = { top: 40, right: 20, bottom: 20, left: 100 };
    const width = dimensions.width - margin.left - margin.right;
    const height = dimensions.height - margin.top - margin.bottom;
    
    d3.select(svgRef.current).selectAll('*').remove();
    
    const svg = d3.select(svgRef.current)
      .attr('width', dimensions.width)
      .attr('height', dimensions.height);
    
    const g = svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);
    
    const xScale = d3.scaleLinear()
      .domain([0, 24])
      .range([0, width * zoomLevel]);
    
    const yScale = d3.scaleBand()
      .domain(days)
      .range([0, height])
      .padding(0.3);
    
    const maxObjects = d3.max(Object.values(dataByDay).flat(), d => d.totalObjects) || 10;
    const thicknessScale = d3.scaleLinear()
      .domain([0, maxObjects])
      .range([2, yScale.bandwidth()]);
    
    const zoomContainer = g.append('g')
      .attr('class', 'zoom-container');
    
    // Add time scale axis
    const xAxis = d3.axisTop(xScale)
      .tickValues(d3.range(0, 25, 1))
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
      .text(d => new Date(d).toLocaleDateString());
    
    days.forEach(day => {
      const dayData = dataByDay[day];
      
      zoomContainer.append('line')
        .attr('x1', 0)
        .attr('x2', width * zoomLevel)
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
              Time: ${new Date(detection.timestamp).toLocaleString()}
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
    
    const zoom = d3.zoom()
      .scaleExtent([1, 10])
      .translateExtent([[0, 0], [width * 10, height]])
      .extent([[0, 0], [width, height]])
      .on('zoom', (event) => {
        zoomContainer.attr('transform', event.transform);
        setZoomLevel(event.transform.k);
        
        const newXScale = event.transform.rescaleX(xScale);
        g.select('.x-axis').call(
          d3.axisTop(newXScale)
            .tickValues(d3.range(0, 25, Math.max(1, Math.floor(1 / event.transform.k))))
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
        overflow: 'auto'
      }}
    >
      <div className="timeline-header" style={{ marginBottom: '10px' }}>
        <h2 style={{ margin: 0, color: '#2c3e50', fontSize: '1.2rem' }}>
          Timeline Visualization
        </h2>
        <div style={{ fontSize: '0.8rem', color: '#5a6c7d', marginTop: '5px' }}>
          Hold Shift + Scroll to zoom • {selectedModels.length} model{selectedModels.length !== 1 ? 's' : ''} selected
        </div>
      </div>
      
      <svg ref={svgRef}></svg>
      
      {/* Model Legend */}
      <div style={{ 
        position: 'absolute', 
        bottom: '10px', 
        right: '10px',
        background: 'rgba(255, 255, 255, 0.9)',
        padding: '10px',
        borderRadius: '8px',
        fontSize: '0.8rem'
      }}>
        {selectedModels.map(model => (
          <div key={model} style={{ display: 'flex', alignItems: 'center', marginBottom: '5px' }}>
            <div style={{
              width: '20px',
              height: '10px',
              backgroundColor: modelColors[model],
              marginRight: '8px',
              borderRadius: '2px'
            }}></div>
            <span>{model}</span>
          </div>
        ))}
      </div>
      
      {/* Tooltip */}
      {tooltip.visible && (
        <div style={{
          position: 'fixed',
          left: tooltip.x,
          top: tooltip.y,
          background: 'rgba(0, 0, 0, 0.9)',
          color: 'white',
          padding: '10px',
          borderRadius: '6px',
          fontSize: '0.8rem',
          pointerEvents: 'none',
          whiteSpace: 'pre-line',
          zIndex: 1000
        }}>
          {tooltip.content}
        </div>
      )}
    </div>
  );
};

export default Timeline;