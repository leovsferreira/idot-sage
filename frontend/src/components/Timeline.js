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
      const bucketKey = `${dayKey}_${bucketTime}`;

      if (!buckets[bucketKey]) {
        buckets[bucketKey] = {
          day: dayKey,
          time: bucketTime,
          withImages: { count: 0, totalObjects: 0 },
          inferenceOnly: { count: 0, totalObjects: 0 },
        };
      }

      selectedModels.forEach((model) => {
        const mr = image.models_results[model];
        if (!mr) return;
        const totalObjects = mr.total_objects || 0;

        if (image.has_image !== false) {
          buckets[bucketKey].withImages.count += 1;
          buckets[bucketKey].withImages.totalObjects += totalObjects;
        } else {
          buckets[bucketKey].inferenceOnly.count += 1;
          buckets[bucketKey].inferenceOnly.totalObjects += totalObjects;
        }
      });
    });

    const aggregatedData = [];

    Object.values(buckets).forEach((b) => {
      const totalInferences = b.withImages.count + b.inferenceOnly.count;
      const totalObjects = b.withImages.totalObjects + b.inferenceOnly.totalObjects;
      if (totalInferences === 0) return;

      const sumValue = totalObjects;
      const avgValue = totalInferences > 0 ? totalObjects / totalInferences : 0;
      const totalValue = aggregationType === 'sum' ? sumValue : avgValue;

      aggregatedData.push({
        day: b.day,
        time: b.time,
        totalValue,
        withImagesObjects: b.withImages.totalObjects,
        inferenceOnlyObjects: b.inferenceOnly.totalObjects,
        withImagesCount: b.withImages.count,
        inferenceOnlyCount: b.inferenceOnly.count,
      });
    });

    return { aggregatedData };
  }, [images, selectedModels, aggregationType, aggregationPeriod]);

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
    if (!containerRef.current || selectedModels.length === 0) return;

    if (activeTab === 'timeline') {
      if (images.length > 0) {
        renderTimelineView();
      }
    } else {
      renderAggregatedView();
    }
  }, [dimensions, images.length, selectedModels.length, activeTab, aggregationType, aggregationPeriod]);

  const renderTimelineView = () => {
    const dataByDay = processTimelineData();
    const days = Object.keys(dataByDay).sort();
    if (days.length === 0) return;

    d3.select(svgRef.current).selectAll('*').remove();
    const { width, height } = dimensions;
    const margin = { top: 30, right: 20, bottom: 20, left: 100 };
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

    if (aggregatedData.length === 0) {
      g.append('text')
        .attr('x', innerWidth / 2)
        .attr('y', innerHeight / 2)
        .attr('text-anchor', 'middle')
        .style('font-size', '14px')
        .style('fill', '#6c757d')
        .text('No aggregated data available');
      return;
    }

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

        const blue = bucket.withImagesObjects;
        const red = bucket.inferenceOnlyObjects;
        const rawTotal = blue + red;

        if (rawTotal <= 0) return;

        const totalBarHeight = Math.max(1, sqrtScale(bucket.totalValue)); 

        let withImagesHeight = (blue / rawTotal) * totalBarHeight;
        let inferenceOnlyHeight = (red / rawTotal) * totalBarHeight;

        if (blue > 0 && withImagesHeight < 1) withImagesHeight = 1;
        if (red > 0 && inferenceOnlyHeight < 1) inferenceOnlyHeight = 1;

        const sumH = withImagesHeight + inferenceOnlyHeight;
        if (sumH > totalBarHeight) {
          const scale = totalBarHeight / sumH;
          withImagesHeight *= scale;
          inferenceOnlyHeight *= scale;
        }

        const barGroup = chartContainer.append('g');

        barGroup
          .append('rect')
          .attr('x', x - barWidth / 2)
          .attr('y', yBaseline - withImagesHeight)
          .attr('width', barWidth)
          .attr('height', withImagesHeight)
          .attr('fill', '#4ECDC4')
          .attr('stroke', '#2c3e50')
          .attr('stroke-width', 0.5);

        barGroup
          .append('rect')
          .attr('x', x - barWidth / 2)
          .attr('y', yBaseline - withImagesHeight - inferenceOnlyHeight)
          .attr('width', barWidth)
          .attr('height', inferenceOnlyHeight)
          .attr('fill', '#FF6B6B')
          .attr('stroke', '#2c3e50')
          .attr('stroke-width', 0.5);

        barGroup
          .append('rect')
          .attr('x', x - barWidth / 2 - 2)
          .attr('y', yBaseline - withImagesHeight - inferenceOnlyHeight - 2)
          .attr('width', barWidth + 4)
          .attr('height', withImagesHeight + inferenceOnlyHeight + 4)
          .attr('fill', 'transparent')
          .on('mouseover', function (event) {
            const content =
              `Time: ${bucket.time.toFixed(2)}h\n` +
              `With Images: ${bucket.withImagesCount} inferences, ${blue} objects\n` +
              `Inference Only: ${bucket.inferenceOnlyCount} inferences, ${red} objects\n` +
              `${aggregationType}: ${bucket.totalValue.toFixed(2)}\n` +
              `Period: ${aggregationPeriod} min`;
            setTooltip({ visible: true, x: event.pageX + 10, y: event.pageY - 10, content });
          })
          .on('mouseout', () => setTooltip({ visible: false, x: 0, y: 0, content: '' }));
      });
    });

    const legend = svg.append('g').attr('transform', `translate(${width - 180}, 10)`);

    legend
      .append('rect')
      .attr('x', -10)
      .attr('y', -5)
      .attr('width', 187)
      .attr('height', 40)
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
      .text(`Stacked Bars - ${aggregationType} per ${aggregationPeriod}min`);

    legend.append('rect').attr('x', 5).attr('y', 18).attr('width', 12).attr('height', 8).attr('fill', '#4ECDC4').attr('stroke', '#2c3e50').attr('stroke-width', 0.5);
    legend
      .append('text')
      .attr('x', 22)
      .attr('y', 25)
      .style('font-size', '10px')
      .style('fill', '#2c3e50')
      .text('With Images');

    legend.append('rect').attr('x', 85).attr('y', 18).attr('width', 12).attr('height', 8).attr('fill', '#FF6B6B').attr('stroke', '#2c3e50').attr('stroke-width', 0.5);
    legend
      .append('text')
      .attr('x', 102)
      .attr('y', 25)
      .style('font-size', '10px')
      .style('fill', '#2c3e50')
      .text('Inference Only');
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

        {/* Model Legend (for timeline view) */}
        {activeTab === 'timeline' && (
          <div
            style={{
              position: 'absolute',
              bottom: '10px',
              right: '10px',
              display: 'flex',
              gap: '10px',
              fontSize: '11px',
            }}
          >
            {selectedModels.map((model) => (
              <div key={model} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <div style={{ width: '12px', height: '12px', backgroundColor: modelColors[model], borderRadius: '2px' }} />
                <span style={{ color: '#5a6c7d' }}>{model}</span>
              </div>
            ))}
          </div>
        )}

        {/* Data Type Legend (for timeline view) */}
        {activeTab === 'timeline' && (
          <div
            style={{
              position: 'absolute',
              top: '10px',
              right: '10px',
              display: 'flex',
              gap: '15px',
              fontSize: '10px',
              color: '#5a6c7d',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <div style={{ width: '12px', height: '4px', backgroundColor: '#999', opacity: 0.8 }} />
              <span>Saved Image</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <div
                style={{
                  width: '12px',
                  height: '4px',
                  backgroundColor: '#999',
                  opacity: 0.6,
                  border: '1px dashed #333',
                }}
              />
              <span>Inference Only</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Timeline;