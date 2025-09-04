import React, { useEffect, useRef, useState, useCallback } from 'react';
import { COLORS } from './styles/colors';
import * as d3 from 'd3';

const Timeline = ({ images = [], selectedModels = [] }) => {
  const svgRef = useRef(null);
  const containerRef = useRef(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 400 });
  const [tooltip, setTooltip] = useState({ visible: false, x: 0, y: 0, content: '' });
  const [activeTab, setActiveTab] = useState('timeline');
  const [aggregationType, setAggregationType] = useState('sum');
  const [aggregationPeriod, setAggregationPeriod] = useState(60);

  const modelColors = {
    YOLOv5n: '#FF6B6B',
    YOLOv8n: '#4ECDC4',
    YOLOv10n: '#45B7D1',
  };

  const processTimelineData = useCallback(() => {
    const dataByDay = {};

    images.forEach((image) => {
      if (!image.models_results) return;

      const date = new Date(image.timestamp);
      const year = date.getUTCFullYear();
      const month = String(date.getUTCMonth() + 1).padStart(2, '0');
      const day = String(date.getUTCDate()).padStart(2, '0');
      const dayKey = `${year}-${month}-${day}`;
      const hour = date.getUTCHours();
      const minutes = date.getUTCMinutes();
      const hourFloat = hour + minutes / 60;

      if (!dataByDay[dayKey]) dataByDay[dayKey] = [];

      selectedModels.forEach((model) => {
        if (image.models_results[model]) {
          dataByDay[dayKey].push({
            hour: hourFloat,
            model,
            totalObjects: image.models_results[model].total_objects || 0,
            timestamp: image.timestamp,
            counts: image.models_results[model].counts || {},
            hasImage: image.has_image !== false,
            filename: image.filename,
            node: image.node,
          });
        }
      });
    });

    return dataByDay;
  }, [images, selectedModels]);

  const processAggregatedData = useCallback(() => {
    if (!images.length || !selectedModels.length) return { aggregatedData: [] };

    const buckets = {};
    const period = Math.max(1, Number(aggregationPeriod) || 60);

    images.forEach((image) => {
      if (!image.models_results) return;

      const date = new Date(image.timestamp);
      const minutes = date.getUTCMinutes();
      const hours = date.getUTCHours();

      const bucketMinutes = Math.floor(minutes / period) * period;
      const bucketTime = +(hours + bucketMinutes / 60).toFixed(2);

      const year = date.getUTCFullYear();
      const month = String(date.getUTCMonth() + 1).padStart(2, '0');
      const day = String(date.getUTCDate()).padStart(2, '0');
      const dayKey = `${year}-${month}-${day}`;

      const bucketKey = `${dayKey}-${bucketTime}`;

      if (!buckets[bucketKey]) {
        buckets[bucketKey] = {
          day: dayKey,
          time: bucketTime,
          withImagesCount: 0,
          inferenceOnlyCount: 0,
          withImagesObjects: 0,
          inferenceOnlyObjects: 0,
          totalValue: 0,
        };
      }

      const bucket = buckets[bucketKey];
      const hasImage = image.has_image !== false;

      selectedModels.forEach((model) => {
        if (image.models_results[model]) {
          const totalObjects = image.models_results[model].total_objects || 0;

          if (hasImage) {
            bucket.withImagesCount++;
            bucket.withImagesObjects += totalObjects;
          } else {
            bucket.inferenceOnlyCount++;
            bucket.inferenceOnlyObjects += totalObjects;
          }
        }
      });

      bucket.totalValue =
        aggregationType === 'sum'
          ? bucket.withImagesObjects + bucket.inferenceOnlyObjects
          : (bucket.withImagesObjects + bucket.inferenceOnlyObjects) / (bucket.withImagesCount + bucket.inferenceOnlyCount) || 0;
    });

    const aggregatedData = Object.values(buckets).filter((bucket) => bucket.totalValue > 0);

    return { aggregatedData };
  }, [images, selectedModels, aggregationType, aggregationPeriod]);

  const handleResize = useCallback(() => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setDimensions({ width: rect.width, height: rect.height });
    }
  }, []);

  useEffect(() => {
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [handleResize]);

  useEffect(() => {
    if (activeTab === 'timeline') {
      renderTimelineView();
    } else if (activeTab === 'aggregated') {
      renderAggregatedView();
    }
  }, [dimensions, images, selectedModels, activeTab, aggregationType, aggregationPeriod]);

  const renderTimelineView = () => {
    const dataByDay = processTimelineData();
    const days = Object.keys(dataByDay).sort();
    if (days.length === 0) return;

    d3.select(svgRef.current).selectAll('*').remove();
    const { width, height } = dimensions;
    const margin = { top: 50, right: 20, bottom: 20, left: 100 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    const svg = d3.select(svgRef.current).attr('width', width).attr('height', height);
    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    const xScale = d3.scaleLinear().domain([0, 24]).range([0, innerWidth]);
    const yScale = d3.scaleBand().domain(days).range([0, innerHeight]).padding(0.2);
    const thicknessScale = d3
      .scaleLinear()
      .domain([0, d3.max(Object.values(dataByDay).flat(), (d) => d.totalObjects)])
      .range([8, Math.min(yScale.bandwidth(), 30)]);

    g.append('g')
      .attr('class', 'x-axis')
      .call(
        d3.axisTop(xScale).tickValues(d3.range(0, 25, 2)).tickFormat((d) => `${d.toString().padStart(2, '0')}:00`)
      )
      .style('font-size', '10px');

    g.append('g')
      .attr('class', 'y-axis')
      .selectAll('text')
      .data(days)
      .enter()
      .append('text')
      .attr('x', -10)
      .attr('y', (d) => yScale(d) + yScale.bandwidth() / 2)
      .attr('text-anchor', 'end')
      .attr('alignment-baseline', 'middle')
      .style('font-size', '12px')
      .style('font-weight', 'bold')
      .style('fill', '#2c3e50')
      .text((d) => {
        const parts = d.split('-');
        const date = new Date(Date.UTC(+parts[0], +parts[1] - 1, +parts[2]));
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
      });

    const chartContainer = g.append('g');

    days.forEach((day) => {
      const dayData = dataByDay[day];

      chartContainer
        .append('line')
        .attr('x1', 0)
        .attr('x2', innerWidth)
        .attr('y1', yScale(day) + yScale.bandwidth() / 2)
        .attr('y2', yScale(day) + yScale.bandwidth() / 2)
        .attr('stroke', '#e1e4ebff')
        .attr('stroke-width', 1)
        .attr('stroke-dasharray', '4,4')
        .attr('opacity', 0.6);

      dayData.forEach((detection) => {
        const thickness = thicknessScale(detection.totalObjects);

        chartContainer
          .append('rect')
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
            const classes = Object.entries(detection.counts)
              .map(([cls, count]) => `${cls}: ${count}`)
              .join(', ');
            const imageStatus = detection.hasImage ? 'Saved Image' : 'Inference Only';
            const content = `Model: ${detection.model}\nTime: ${new Date(
              detection.timestamp
            ).toLocaleString('en-US', { timeZone: 'UTC', hour12: false })} UTC\nNode: ${
              detection.node
            }\nStatus: ${imageStatus}\nDetected: ${classes || 'None'}\nTotal Objects: ${
              detection.totalObjects
            }`;
            setTooltip({ visible: true, x: event.pageX + 10, y: event.pageY - 10, content });
          })
          .on('mouseout', () => setTooltip({ visible: false, x: 0, y: 0, content: '' }));
      });
    });

    for (let hour = 0; hour <= 24; hour += 4) {
      chartContainer
        .append('line')
        .attr('x1', xScale(hour))
        .attr('x2', xScale(hour))
        .attr('y1', 0)
        .attr('y2', innerHeight)
        .attr('stroke', '#e1e4ebff')
        .attr('stroke-width', 1)
        .attr('stroke-dasharray', '4,4')
        .attr('opacity', 0.6);
    }

    const strokeLegend = svg.append('g').attr('transform', `translate(${width - 210}, -15)`);

    strokeLegend
      .append('rect')
      .attr('x', -5)
      .attr('y', 20)
      .attr('width', 18)
      .attr('height', 4)
      .attr('fill', "#93889A")
      .attr('opacity', 0.8);

    strokeLegend
      .append('text')
      .attr('x', 15)
      .attr('y', 26)
      .style('font-size', '10px')
      .style('fill', '#2c3e50')
      .text('Saved Image');

    // Dashed line example
    strokeLegend
      .append('rect')
      .attr('x', 80)
      .attr('y', 20)
      .attr('width', 18)
      .attr('height', 4)
      .attr('fill', "#93889A")
      .attr('opacity', 0.6)
      .attr('stroke', '#333')
      .attr('stroke-width', 1)
      .attr('stroke-dasharray', '2,2');

    strokeLegend
      .append('text')
      .attr('x', 100)
      .attr('y', 26)
      .style('font-size', '10px')
      .style('fill', '#2c3e50')
      .text('Inference Only');

    if (selectedModels.length > 0) {
      const modelLegend = svg.append('g').attr('transform', `translate(${width - 130}, ${height - 40})`);

      const legendHeight = Math.max(45, selectedModels.length * 15 + 20);
      
      selectedModels.forEach((model, index) => {
        const yPos = -legendHeight + 35 + (index * 15);
        
        modelLegend
          .append('rect')
          .attr('x', 0)
          .attr('y', yPos)
          .attr('width', 12)
          .attr('height', 8)
          .attr('fill', modelColors[model])
          .attr('opacity', 0.8);

        modelLegend
          .append('text')
          .attr('x', 15)
          .attr('y', yPos + 7)
          .style('font-size', '10px')
          .style('fill', '#2c3e50')
          .text(model);
      });
    }
  };

  const renderAggregatedView = () => {
    const { aggregatedData } = processAggregatedData();

    d3.select(svgRef.current).selectAll('*').remove();
    const { width, height } = dimensions;
    const margin = { top: 80, right: 20, bottom: 20, left: 100 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    const svg = d3.select(svgRef.current).attr('width', width).attr('height', height);
    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    const dataByDay = {};
    aggregatedData.forEach((d) => {
      if (!dataByDay[d.day]) dataByDay[d.day] = [];
      dataByDay[d.day].push(d);
    });

    const days = Object.keys(dataByDay).sort();
    if (days.length === 0) return;

    const xScale = d3.scaleLinear().domain([0, 24]).range([0, innerWidth]);
    const yScale = d3.scaleBand().domain(days).range([0, innerHeight]).padding(0.2);

    g.append('g')
      .attr('class', 'x-axis')
      .call(
        d3.axisTop(xScale).tickValues(d3.range(0, 25, 2)).tickFormat((d) => `${d.toString().padStart(2, '0')}:00`)
      )
      .style('font-size', '10px');

    g.append('g')
      .attr('class', 'y-axis')
      .selectAll('text')
      .data(days)
      .enter()
      .append('text')
      .attr('x', -10)
      .attr('y', (d) => yScale(d) + yScale.bandwidth() / 2)
      .attr('text-anchor', 'end')
      .attr('alignment-baseline', 'middle')
      .style('font-size', '12px')
      .style('font-weight', 'bold')
      .style('fill', '#2c3e50')
      .text((d) => {
        const parts = d.split('-');
        const date = new Date(Date.UTC(+parts[0], +parts[1] - 1, +parts[2]));
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
      });

    const chartContainer = g.append('g');

    days.forEach((day) => {
      chartContainer
        .append('line')
        .attr('x1', 0)
        .attr('x2', innerWidth)
        .attr('y1', yScale(day) + yScale.bandwidth() / 2)
        .attr('y2', yScale(day) + yScale.bandwidth() / 2)
        .attr('stroke', '#e1e4ebff')
        .attr('stroke-width', 1)
        .attr('stroke-dasharray', '4,4')
        .attr('opacity', 0.6);
    });
    
    for (let hour = 0; hour <= 24; hour += 4) {
      chartContainer
        .append('line')
        .attr('x1', xScale(hour))
        .attr('x2', xScale(hour))
        .attr('y1', 0)
        .attr('y2', innerHeight)
        .attr('stroke', '#e1e4ebff')
        .attr('stroke-width', 1)
        .attr('stroke-dasharray', '4,4')
        .attr('opacity', 0.6);
    }

    const maxTotal = d3.max(aggregatedData, (d) => d.totalValue) || 1;
    const maxBarHeight = Math.min(yScale.bandwidth() * 0.8, 40);
    const barWidth = 10;

    const sqrtScale = d3.scaleSqrt().domain([0, maxTotal]).range([0, maxBarHeight]);

    days.forEach((day) => {
      const dayData = dataByDay[day];

      dayData.forEach((bucket) => {
        const x = xScale(bucket.time);
        const yBaseline = yScale(day) + yScale.bandwidth() / 2;

        const totalBarHeight = Math.max(1, sqrtScale(bucket.totalValue));

        const barGroup = chartContainer.append('g');

        const modelColor = '#FF6B6B';
        
        barGroup
          .append('rect')
          .attr('x', x - barWidth / 2)
          .attr('y', yBaseline - totalBarHeight)
          .attr('width', barWidth)
          .attr('height', totalBarHeight)
          .attr('fill', modelColor)
          .attr('stroke', '#2c3e50')
          .attr('stroke-width', 0.5)
          .attr('opacity', 0.8);

        barGroup
          .append('rect')
          .attr('x', x - barWidth / 2 - 2)
          .attr('y', yBaseline - totalBarHeight - 2)
          .attr('width', barWidth + 4)
          .attr('height', totalBarHeight + 4)
          .attr('fill', 'transparent')
          .on('mouseover', function (event) {
            const content =
              `Time: ${bucket.time.toFixed(2)}h\n` +
              `Total: ${bucket.totalValue} inferences, (${aggregationType})\n` +
              `With Images: ${bucket.withImagesCount} inferences, ${bucket.withImagesObjects} objects\n` +
              `Inference Only: ${bucket.inferenceOnlyCount} inferences, ${bucket.inferenceOnlyObjects} objects\n` +
              `Period: ${aggregationPeriod} min`;
            setTooltip({ visible: true, x: event.pageX + 10, y: event.pageY - 10, content });
          })
          .on('mouseout', () => setTooltip({ visible: false, x: 0, y: 0, content: '' }));
      });
    });

    const legend = svg.append('g').attr('transform', `translate(${width - 200}, 10)`);

    legend
      .append('rect')
      .attr('x', -10)
      .attr('y', -5)
      .attr('width', 167)
      .attr('height', 50)
      .attr('fill', 'rgba(255, 255, 255, 0.9)')
      .attr('stroke', '#ddd')
      .attr('rx', 4);

    legend
      .append('text')
      .attr('x', 0)
      .attr('y', 10)
      .style('font-size', '11px')
      .style('font-weight', 'bold')
      .style('fill', '#2c3e50')
      .text(`Bar Chart - ${aggregationType} per ${aggregationPeriod}min`);

    legend.append('rect').attr('x', 0).attr('y', 20).attr('width', 12).attr('height', 8).attr('fill', '#FF6B6B').attr('stroke', '#2c3e50').attr('stroke-width', 0.5);
    legend
      .append('text')
      .attr('x', 15)
      .attr('y', 27)
      .style('font-size', '10px')
      .style('fill', '#2c3e50')
      .text('YOLOv8n');
  };

  return (
    <div style={{ position: 'relative' }}>
      {/* Tabs positioned outside and above the blue container */}
      <div
        style={{
          position: 'absolute',
          top: '4px',
          left: '0px',
          display: 'flex',
          gap: '2px',
          zIndex: 20,
        }}
      >
        <button
          onClick={() => setActiveTab('timeline')}
          style={{
            padding: '6px 12px',
            border: 'none',
            borderRadius: '6px 6px 0 0',
            backgroundColor: activeTab === 'timeline' ? '#99a5ad' : '#BBC6CD',
            color: activeTab === 'timeline' ? '#ffffff' : '#e9ecef',
            fontSize: '11px',
            fontWeight: 'bold',
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
        >
          Timeline View
        </button>
        <button
          onClick={() => setActiveTab('aggregated')}
          style={{
            padding: '6px 12px',
            border: 'none',
            borderRadius: '6px 6px 0 0',
            backgroundColor: activeTab === 'aggregated' ? '#99a5ad' : '#BBC6CD',
            color: activeTab === 'aggregated' ? '#ffffff' : '#e9ecef',
            fontSize: '11px',
            fontWeight: 'bold',
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
        >
          Aggregated View
        </button>
      </div>

      {/* Blue container with square top-left corner */}
      <div
        ref={containerRef}
        style={{
          height: '30vh',
          backgroundColor: COLORS.blueGray,
          borderRadius: '0 12px 12px 12px',
          padding: '20px',
          position: 'relative',
          overflow: 'hidden',
          userSelect: 'none',
          pointerEvents: 'auto',
          marginTop: '28px',
        }}
      >
        {/* Aggregated View Controls */}
        {activeTab === 'aggregated' && (
          <div
            style={{
              position: 'absolute',
              top: '10px',
              left: '20px',
              display: 'flex',
              gap: '15px',
              alignItems: 'center',
              zIndex: 10,
              fontSize: '11px',
              flexWrap: 'wrap',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <label style={{ color: '#2c3e50', fontWeight: 'bold' }}>Aggregation:</label>
              <select
                value={aggregationType}
                onChange={(e) => setAggregationType(e.target.value)}
                style={{
                  padding: '4px 8px',
                  borderRadius: '4px',
                  border: '1px solid #ddd',
                  fontSize: '11px',
                }}
              >
                <option value="sum">Sum</option>
                <option value="average">Average</option>
              </select>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <label style={{ color: '#2c3e50', fontWeight: 'bold' }}>Period:</label>
              <select
                value={aggregationPeriod}
                onChange={(e) => setAggregationPeriod(Number(e.target.value))}
                style={{
                  padding: '4px 8px',
                  borderRadius: '4px',
                  border: '1px solid #ddd',
                  fontSize: '11px',
                }}
              >
                <option value={15}>15 min</option>
                <option value={30}>30 min</option>
                <option value={60}>60 min</option>
              </select>
            </div>
          </div>
        )}

        {/* Empty State for Timeline and Aggregated View */}
        {(activeTab === 'timeline' || activeTab === 'aggregated') && images.length === 0 && (
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              textAlign: 'center',
              color: '#6c757d',
              fontSize: '14px',
            }}
          >
            <div>No data</div>
          </div>
        )}

        <svg
          ref={svgRef}
          style={{
            width: '100%',
            height: '100%',
            cursor: 'default',
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
              maxWidth: '220px',
            }}
          >
            {tooltip.content}
          </div>
        )}
      </div>
    </div>
  );
};

export default Timeline;