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
  const [showSavedImage, setShowSavedImage] = useState(true);
  const [showInferenceOnly, setShowInferenceOnly] = useState(true);

  const MARGIN = { top: 80, right: 20, bottom: 20, left: 100 };
  const TITLE_Y = -30;

  const modelColors = {
    YOLOv5n: '#FF6B6B',
    YOLOv8n: '#4ECDC4',
    YOLOv10n: '#45B7D1',
  };

  const drawModelLegend = (svg, selectedModels, modelColors) => {
    if (!selectedModels.length) return;

    const entryH = 15;
    const x = 10;
    const y = MARGIN.top - 30;

    const legend = svg.append('g').attr('transform', `translate(${x}, ${y})`);

    selectedModels.forEach((model, i) => {
      const yPos = i * entryH;
      legend.append('rect')
        .attr('x', 0)
        .attr('y', yPos - 8)
        .attr('width', 12)
        .attr('height', 8)
        .attr('fill', modelColors[model] || '#888')
        .attr('opacity', 0.8);

      legend.append('text')
        .attr('x', 15)
        .attr('y', yPos - 1) 
        .style('font-size', '10px')
        .style('fill', '#2c3e50')
        .text(model);
    });
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
    if (!images.length || !selectedModels.length) return { aggregatedData: [], maxValue: 1 };

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
          perModel: {}
        };
      }

      const hasImage = image.has_image !== false;

      selectedModels.forEach((model) => {
        const mr = image.models_results[model];
        if (!mr) return;

        if (!buckets[bucketKey].perModel[model]) {
          buckets[bucketKey].perModel[model] = {
            withImagesCount: 0,
            inferenceOnlyCount: 0,
            withImagesObjects: 0,
            inferenceOnlyObjects: 0,
          };
        }
        const s = buckets[bucketKey].perModel[model];
        const totalObjects = mr.total_objects || 0;

        if (hasImage) {
          s.withImagesCount += 1;
          s.withImagesObjects += totalObjects;
        } else {
          s.inferenceOnlyCount += 1;
          s.inferenceOnlyObjects += totalObjects;
        }
      });
    });

    const aggregatedData = [];
    let maxValue = 1;

    Object.values(buckets).forEach((b) => {
      const perModelValues = {};
      Object.entries(b.perModel).forEach(([model, s]) => {
        const totalObjects = s.withImagesObjects + s.inferenceOnlyObjects;
        const totalCount = s.withImagesCount + s.inferenceOnlyCount;
        const value =
          aggregationType === 'sum'
            ? totalObjects
            : totalCount > 0
              ? totalObjects / totalCount
              : 0;

        perModelValues[model] = {
          value,
          ...s,
          totalObjects,
          totalCount,
        };
        if (value > maxValue) maxValue = value;
      });

      if (Object.values(perModelValues).some((m) => m.value > 0)) {
        aggregatedData.push({
          day: b.day,
          time: b.time,
          perModelValues,
        });
      }
    });

    return { aggregatedData, maxValue };
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
  }, [dimensions, images, selectedModels, activeTab, aggregationType, aggregationPeriod, showSavedImage, showInferenceOnly]);

  const renderTimelineView = () => {
    const dataByDay = processTimelineData();
    const days = Object.keys(dataByDay).sort();
    if (days.length === 0) {
      d3.select(svgRef.current).selectAll('*').remove();
      return;
    }

    d3.select(svgRef.current).selectAll('*').remove();
    const { width, height } = dimensions;
    const margin = MARGIN;
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
        if (detection.hasImage && !showSavedImage) return;
        if (!detection.hasImage && !showInferenceOnly) return;

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

    const savedGroup = strokeLegend.append('g').attr('transform', `translate(0,0)`).style('cursor', 'pointer');
    savedGroup
      .append('rect')
      .attr('x', -5)
      .attr('y', 20)
      .attr('width', 18)
      .attr('height', 4)
      .attr('fill', '#93889A')
      .attr('opacity', showSavedImage ? 0.8 : 0.2);
    savedGroup
      .append('text')
      .attr('x', 15)
      .attr('y', 26)
      .style('font-size', '10px')
      .style('fill', showSavedImage ? '#2c3e50' : '#9aa1a6')
      .text('Saved Image');
    savedGroup
      .append('rect')
      .attr('x', -8)
      .attr('y', 12)
      .attr('width', 90)
      .attr('height', 20)
      .attr('fill', 'transparent')
      .on('click', () => setShowSavedImage((v) => !v));

    const infGroup = strokeLegend.append('g').attr('transform', `translate(80,0)`).style('cursor', 'pointer');
    infGroup
      .append('rect')
      .attr('x', 0)
      .attr('y', 20)
      .attr('width', 18)
      .attr('height', 4)
      .attr('fill', '#93889A')
      .attr('opacity', showInferenceOnly ? 0.6 : 0.2)
      .attr('stroke', '#333')
      .attr('stroke-width', 1)
      .attr('stroke-dasharray', '2,2');
    infGroup
      .append('text')
      .attr('x', 20)
      .attr('y', 26)
      .style('font-size', '10px')
      .style('fill', showInferenceOnly ? '#2c3e50' : '#9aa1a6')
      .text('Inference Only');
    infGroup
      .append('rect')
      .attr('x', -3)
      .attr('y', 12)
      .attr('width', 110)
      .attr('height', 20)
      .attr('fill', 'transparent')
      .on('click', () => setShowInferenceOnly((v) => !v));

    drawModelLegend(svg, selectedModels, modelColors);
  };

  const renderAggregatedView = () => {
    const { aggregatedData, maxValue } = processAggregatedData();

    d3.select(svgRef.current).selectAll('*').remove();
    const { width, height } = dimensions;
    const margin = MARGIN;
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
      .call(d3.axisTop(xScale).tickValues(d3.range(0, 25, 2)).tickFormat((d) => `${d.toString().padStart(2, '0')}:00`))
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

    g.append('text')
      .attr('x', innerWidth / 2)
      .attr('y', TITLE_Y)
      .attr('text-anchor', 'middle')
      .style('font-size', '11px')
      .style('font-weight', 'bold')
      .style('fill', '#2c3e50')
      .text(`Bar Chart - ${aggregationType} per ${aggregationPeriod}min`);

    const sqrtScale = d3.scaleSqrt().domain([0, maxValue]).range([0, Math.min(yScale.bandwidth() * 0.8, 40)]);
    const BAR_GAP = 2;
    const DEFAULT_BAR_WIDTH = 8;

    days.forEach((day) => {
      const dayData = dataByDay[day];

      dayData.forEach((bucket) => {
        const modelsToPlot = selectedModels.filter(
          (m) => bucket.perModelValues[m] && bucket.perModelValues[m].value > 0
        );

        if (modelsToPlot.length === 0) return;

        const barWidth = Math.max(4, Math.min(DEFAULT_BAR_WIDTH, 28 / modelsToPlot.length));
        const groupWidth = modelsToPlot.length * barWidth + (modelsToPlot.length - 1) * BAR_GAP;

        const xCenter = xScale(bucket.time);
        const xStart = xCenter - groupWidth / 2;
        const yBaseline = yScale(day) + yScale.bandwidth() / 2;

        modelsToPlot.forEach((model, i) => {
          const stats = bucket.perModelValues[model];
          const h = Math.max(1, sqrtScale(stats.value));
          const x = xStart + i * (barWidth + BAR_GAP);

          const group = chartContainer.append('g');

          group
            .append('rect')
            .attr('x', x)
            .attr('y', yBaseline - h)
            .attr('width', barWidth)
            .attr('height', h)
            .attr('fill', modelColors[model] || '#888')
            .attr('stroke', '#2c3e50')
            .attr('stroke-width', 0.5)
            .attr('opacity', 0.85);

          group
            .append('rect')
            .attr('x', x - 2)
            .attr('y', yBaseline - h - 2)
            .attr('width', barWidth + 4)
            .attr('height', h + 4)
            .attr('fill', 'transparent')
            .on('mouseover', (event) => {
              const content =
                `Model: ${model}\n` +
                `Time: ${bucket.time.toFixed(2)}h\n` +
                `Value: ${stats.value} (${aggregationType})\n` +
                `With Images: ${stats.withImagesCount} inferences, ${stats.withImagesObjects} objects\n` +
                `Inference Only: ${stats.inferenceOnlyCount} inferences, ${stats.inferenceOnlyObjects} objects\n` +
                `Period: ${aggregationPeriod} min`;
              setTooltip({ visible: true, x: event.pageX + 10, y: event.pageY - 10, content });
            })
            .on('mouseout', () => setTooltip({ visible: false, x: 0, y: 0, content: '' }));
        });
      });
    });

    drawModelLegend(svg, selectedModels, modelColors);
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
