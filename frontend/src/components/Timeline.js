import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
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

  // FIX: use normal, unswapped names
  const [showSavedImage, setShowSavedImage] = useState(true);
  const [showInferenceOnly, setShowInferenceOnly] = useState(true);

  const [hiddenTimelineModels, setHiddenTimelineModels] = useState(new Set());
  const [hiddenAggregatedModels, setHiddenAggregatedModels] = useState(new Set());

  const MARGIN = { top: 80, right: 64, bottom: 20, left: 100 };
  const TITLE_Y = -30;

  const modelColors = {
    YOLOv5n: '#FF6B6B',
    YOLOv8n: '#4ECDC4',
    YOLOv10n: '#45B7D1',
  };

  const presentModels = useMemo(() => {
    const set = new Set();
    images.forEach(img => {
      if (img?.models_results) {
        Object.keys(img.models_results).forEach(m => set.add(m));
      }
    });
    return Array.from(set).sort();
  }, [images]);

  const clamp = (v, min, max) => Math.min(Math.max(v, min), max);
  const makeTopTickFormatter = () => (d) => `${Math.floor(d).toString().padStart(2, '0')}:00`;
  const hhmmUTC = (d) => d.toISOString().slice(11, 16);

  const bucketWindow = (dayStr, timeFloat, periodMin) => {
    const [Y, M, D] = dayStr.split('-').map(Number);
    const h = Math.floor(timeFloat);
    const m = Math.round((timeFloat - h) * 60);
    const start = new Date(Date.UTC(Y, M - 1, D, h, m, 0));
    const end = new Date(start.getTime() + periodMin * 60 * 1000 - 1000);
    return [start, end];
  };

  // --- Categorical axis helpers (aggregated) ---
  const buildTickCenters = (periodMin, maxLabels = 10, domain = [0, 24]) => {
    const stepH = periodMin / 60;
    const half = stepH / 2;
    const centers = [];
    let c = Math.ceil((domain[0] - half) / stepH) * stepH + half;
    if (isNaN(c)) c = half;
    for (; c < domain[1] - 1e-6; c += stepH) centers.push(+c.toFixed(6));
    const total = centers.length;
    const stride = Math.max(1, Math.ceil(total / maxLabels));
    return centers.filter((_, i) => i % stride === 0);
  };

  const makeCenteredRangeTickFormatter = (periodMin) => (centerT) => {
    const stepH = periodMin / 60;
    const startT = centerT - stepH / 2;
    const endT = centerT + stepH / 2;
    const sh = Math.floor(startT);
    const sm = Math.round((startT - sh) * 60);
    const eh = Math.floor(endT);
    const em = Math.round((endT - eh) * 60) - 1;
    const start = new Date(Date.UTC(2000, 0, 1, sh, sm < 0 ? 0 : sm, 0));
    const end = new Date(Date.UTC(2000, 0, 1, eh, em < 0 ? 0 : em, 59));
    const hhmm = (d) => d.toISOString().slice(11, 16);
    return `${hhmm(start)}–${hhmm(end)}`;
  };

  const buildBoundaries = (periodMin, domain = [0, 24]) => {
    const stepH = periodMin / 60;
    const vals = [];
    let t = Math.floor(domain[0] / stepH) * stepH;
    for (; t <= domain[1] + 1e-6; t += stepH) vals.push(+t.toFixed(6));
    return vals;
  };

  const drawModelLegend = (svg, models, modelColors, hiddenSet, toggleModel) => {
    if (!models.length) return;
    const entryH = 16;
    const x = 10;
    const y = MARGIN.top - 30;
    const legend = svg.append('g').attr('transform', `translate(${x}, ${y})`);
    models.forEach((model, i) => {
      const yPos = i * entryH;
      const isHidden = hiddenSet.has(model);
      const opacity = isHidden ? 0.25 : 0.9;
      legend.append('rect')
        .attr('x', 0).attr('y', yPos - 9).attr('width', 12).attr('height', 8)
        .attr('fill', modelColors[model] || '#888').attr('opacity', opacity);
      legend.append('text')
        .attr('x', 16).attr('y', yPos - 1).style('font-size', '10px')
        .style('fill', isHidden ? '#9aa1a6' : '#2c3e50')
        .style('font-weight', isHidden ? 'normal' : 'bold')
        .text(model);
      legend.append('rect')
        .attr('x', -4).attr('y', yPos - 12).attr('width', 120).attr('height', 16)
        .attr('fill', 'transparent').style('cursor', 'pointer')
        .on('click', () => toggleModel(model));
    });
  };

  const processTimelineData = useCallback(
    (hiddenSet) => {
      const dataByDay = {};
      images.forEach((image) => {
        if (!image?.models_results) return;
        const date = new Date(image.timestamp);
        const year = date.getUTCFullYear();
        const month = String(date.getUTCMonth() + 1).padStart(2, '0');
        const day = String(date.getUTCDate()).padStart(2, '0');
        const dayKey = `${year}-${month}-${day}`;
        const hour = date.getUTCHours();
        const minutes = date.getUTCMinutes();
        const hourFloat = hour + minutes / 60;
        if (!dataByDay[dayKey]) dataByDay[dayKey] = [];
        presentModels.forEach((model) => {
          if (hiddenSet.has(model)) return;
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
    },
    [images, presentModels]
  );

  const processAggregatedData = useCallback(() => {
    if (!images.length || !presentModels.length) return { aggregatedData: [], maxValue: 1 };
    const buckets = {};
    const period = Math.max(1, Number(aggregationPeriod) || 60);
    images.forEach((image) => {
      if (!image?.models_results) return;
      const date = new Date(image.timestamp);
      const minutes = date.getUTCMinutes();
      const hours = date.getUTCHours();
      const bucketMinutes = Math.floor(minutes / period) * period;
      const bucketTime = +(hours + bucketMinutes / 60).toFixed(2); // START
      const year = date.getUTCFullYear();
      const month = String(date.getUTCMonth() + 1).padStart(2, '0');
      const day = String(date.getUTCDate()).padStart(2, '0');
      const dayKey = `${year}-${month}-${day}`;
      const bucketKey = `${dayKey}-${bucketTime}`;
      if (!buckets[bucketKey]) {
        buckets[bucketKey] = { day: dayKey, time: bucketTime, perModel: {} };
      }
      const hasImage = image.has_image !== false;
      presentModels.forEach((model) => {
        const mr = image.models_results[model];
        if (!mr) return;
        if (!buckets[bucketKey].perModel[model]) {
          buckets[bucketKey].perModel[model] = {
            withImagesCount: 0, inferenceOnlyCount: 0,
            withImagesObjects: 0, inferenceOnlyObjects: 0,
          };
        }
        const s = buckets[bucketKey].perModel[model];
        const totalObjects = mr.total_objects || 0;
        if (hasImage) { s.withImagesCount += 1; s.withImagesObjects += totalObjects; }
        else { s.inferenceOnlyCount += 1; s.inferenceOnlyObjects += totalObjects; }
      });
    });

    const aggregatedData = [];
    let maxValue = 1;
    Object.values(buckets).forEach((b) => {
      const perModelValues = {};
      Object.entries(b.perModel).forEach(([model, s]) => {
        const totalObjects = s.withImagesObjects + s.inferenceOnlyObjects;
        const totalCount = s.withImagesCount + s.inferenceOnlyCount;
        const value = aggregationType === 'sum' ? totalObjects : (totalCount > 0 ? totalObjects / totalCount : 0);
        perModelValues[model] = { value, ...s, totalObjects, totalCount };
        if (value > maxValue) maxValue = value;
      });
      if (Object.values(perModelValues).some((m) => m.value > 0)) {
        aggregatedData.push({ day: b.day, time: b.time, perModelValues });
      }
    });

    return { aggregatedData, maxValue };
  }, [images, presentModels, aggregationType, aggregationPeriod]);

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
    if (activeTab === 'timeline') renderTimelineView();
    else if (activeTab === 'aggregated') renderAggregatedView();
  }, [
    dimensions, images, activeTab, aggregationType, aggregationPeriod,
    showSavedImage, showInferenceOnly, presentModels,
    hiddenTimelineModels, hiddenAggregatedModels,
  ]);

  const toggleTimelineModel = (model) => {
    setHiddenTimelineModels((prev) => {
      const next = new Set(prev);
      if (next.has(model)) next.delete(model); else next.add(model);
      return next;
    });
  };
  const toggleAggregatedModel = (model) => {
    setHiddenAggregatedModels((prev) => {
      const next = new Set(prev);
      if (next.has(model)) next.delete(model); else next.add(model);
      return next;
    });
  };

  const renderTimelineView = () => {
    const dataByDay = processTimelineData(hiddenTimelineModels);
    const days = Object.keys(dataByDay).sort();

    d3.select(svgRef.current).selectAll('*').remove();
    if (days.length === 0) return;

    const { width, height } = dimensions;
    const margin = MARGIN;
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    const svg = d3.select(svgRef.current).attr('width', width).attr('height', height);
    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    const xScale = d3.scaleLinear().domain([0, 24]).range([0, innerWidth]);
    const yScale = d3.scaleBand().domain(days).range([0, innerHeight]).padding(0.2);

    const flattenedVisible = Object.values(dataByDay).flat();
    const maxObjects = d3.max(flattenedVisible, (d) => d.totalObjects) || 1;
    const thicknessScale = d3.scaleLinear().domain([0, maxObjects]).range([8, Math.min(yScale.bandwidth(), 30)]);

    const xAxisG = g.append('g').attr('class', 'x-axis');
    const drawAxis = (scale) => {
      const [d0, d1] = scale.domain();
      const start = Math.ceil(d0 / 2) * 2;
      const ticks = d3.range(start, d1 + 1e-6, 2);
      xAxisG.call(d3.axisTop(scale).tickValues(ticks).tickFormat(makeTopTickFormatter())).style('font-size', '10px');
    };
    drawAxis(xScale);

    g.append('g').attr('class', 'y-axis')
      .selectAll('text').data(days).enter().append('text')
      .attr('x', -10).attr('y', (d) => yScale(d) + yScale.bandwidth() / 2)
      .attr('text-anchor', 'end').attr('alignment-baseline', 'middle')
      .style('font-size', '12px').style('font-weight', 'bold').style('fill', '#2c3e50')
      .text((d) => {
        const parts = d.split('-'); const date = new Date(Date.UTC(+parts[0], +parts[1] - 1, +parts[2]));
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
      });

    const chartContainer = g.append('g');

    days.forEach((day) => {
      chartContainer.append('line')
        .attr('x1', 0).attr('x2', innerWidth)
        .attr('y1', yScale(day) + yScale.bandwidth() / 2)
        .attr('y2', yScale(day) + yScale.bandwidth() / 2)
        .attr('stroke', '#e1e4ebff').attr('stroke-width', 1).attr('stroke-dasharray', '4,4').attr('opacity', 0.6);
    });

    days.forEach((day) => {
      const dayData = dataByDay[day];
      dayData.forEach((detection) => {
        if (detection.hasImage && !showSavedImage) return;
        if (!detection.hasImage && !showInferenceOnly) return;
        const thickness = thicknessScale(detection.totalObjects);
        chartContainer.append('rect')
          .attr('x', xScale(detection.hour) - 2)
          .attr('y', yScale(day) + (yScale.bandwidth() - thickness) / 2)
          .attr('width', 4).attr('height', thickness)
          .attr('fill', modelColors[detection.model] || '#888')
          .attr('opacity', detection.hasImage ? 0.8 : 0.6)
          .attr('stroke', detection.hasImage ? 'none' : '#333')
          .attr('stroke-width', detection.hasImage ? 0 : 1)
          .attr('stroke-dasharray', detection.hasImage ? 'none' : '2,2')
          .attr('shape-rendering', 'crispEdges')
          .on('mouseover', (event) => {
            const classes = Object.entries(detection.counts).map(([cls, count]) => `${cls}: ${count}`).join(', ');
            const imageStatus = detection.hasImage ? 'Saved Image' : 'Inference Only';
            const content = `Model: ${detection.model}\nTime: ${new Date(detection.timestamp)
              .toLocaleString('en-US', { timeZone: 'UTC', hour12: false })} UTC\nNode: ${detection.node}\nStatus: ${imageStatus}\nDetected: ${classes || 'None'}\nTotal Objects: ${detection.totalObjects}`;
            setTooltip({ visible: true, x: event.pageX + 10, y: event.pageY - 10, content });
          })
          .on('mouseout', () => setTooltip({ visible: false, x: 0, y: 0, content: '' }));
      });
    });

    for (let hour = 0; hour <= 24; hour += 4) {
      chartContainer.append('line')
        .attr('x1', xScale(hour)).attr('x2', xScale(hour))
        .attr('y1', 0).attr('y2', innerHeight)
        .attr('stroke', '#e1e4ebff').attr('stroke-width', 1).attr('stroke-dasharray', '4,4').attr('opacity', 0.6);
    }

    drawModelLegend(svg, presentModels, modelColors, hiddenTimelineModels, toggleTimelineModel);

    const zoom = d3.zoom()
      .scaleExtent([1, 40])
      .translateExtent([[0, 0], [innerWidth, innerHeight]])
      .extent([[0, 0], [innerWidth, innerHeight]])
      .on('zoom', (event) => {
        const t = event.transform;
        chartContainer.attr('transform', `translate(${t.x},0) scale(${t.k},1)`);
        drawAxis(t.rescaleX(xScale));
      });

    const zoomPane = g.append('rect')
      .attr('class', 'zoom-pane')
      .attr('x', 0).attr('y', 0).attr('width', innerWidth).attr('height', innerHeight)
      .style('fill', 'transparent').style('cursor', 'grab').lower();

    zoomPane.call(zoom)
      .on('dblclick.zoom', null)
      .on('mousedown', () => zoomPane.style('cursor', 'grabbing'))
      .on('mouseup', () => zoomPane.style('cursor', 'grab'))
      .on('mouseleave', () => zoomPane.style('cursor', 'grab'));
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

    const xAxisG = g.append('g').attr('class', 'x-axis');
    const sqrtScale = d3.scaleSqrt().domain([0, maxValue || 1]).range([0, Math.min(yScale.bandwidth() * 0.8, 40)]);

    const BASE_BAR_GAP = 2;
    const MIN_BAR_GAP = 0;
    const MIN_BAR_WIDTH = 1;
    const MAX_BAR_WIDTH = 8;
    const INNER_PAD = 3;

    const drawAggAxis = (scale) => {
      const [d0, d1] = scale.domain();
      const stepH = aggregationPeriod / 60;
      const pxPerHour = scale(1) - scale(0);
      const periodPx = pxPerHour * stepH;
      const minPx = 80;
      const every = Math.max(1, Math.ceil(minPx / Math.max(1, periodPx)));
      const centers = buildTickCenters(aggregationPeriod, Number.POSITIVE_INFINITY, [d0, d1])
        .filter((_, i) => i % every === 0);
      xAxisG
        .call(d3.axisTop(scale).tickValues(centers).tickFormat(makeCenteredRangeTickFormatter(aggregationPeriod)))
        .style('font-size', '10px');
    };
    drawAggAxis(xScale);

    g.append('g').attr('class', 'y-axis')
      .selectAll('text').data(days).enter().append('text')
      .attr('x', -10).attr('y', (d) => yScale(d) + yScale.bandwidth() / 2)
      .attr('text-anchor', 'end').attr('alignment-baseline', 'middle')
      .style('font-size', '12px').style('font-weight', 'bold').style('fill', '#2c3e50')
      .text((d) => {
        const parts = d.split('-'); const date = new Date(Date.UTC(+parts[0], +parts[1] - 1, +parts[2]));
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
      });

    const chartContainer = g.append('g');

    days.forEach((day) => {
      chartContainer.append('line')
        .attr('x1', 0).attr('x2', innerWidth)
        .attr('y1', yScale(day) + yScale.bandwidth() / 2)
        .attr('y2', yScale(day) + yScale.bandwidth() / 2)
        .attr('stroke', '#e1e4ebff').attr('stroke-width', 1).attr('stroke-dasharray', '4,4').attr('opacity', 0.6);
    });

    buildBoundaries(aggregationPeriod, [0, 24]).forEach((b) => {
      chartContainer.append('line')
        .attr('x1', xScale(b)).attr('x2', xScale(b))
        .attr('y1', 0).attr('y2', innerHeight)
        .attr('stroke', '#e1e4ebff').attr('stroke-width', 1).attr('stroke-dasharray', '4,4').attr('opacity', 0.6);
    });

    g.append('text')
      .attr('x', innerWidth / 2).attr('y', TITLE_Y).attr('text-anchor', 'middle')
      .style('font-size', '11px').style('font-weight', 'bold').style('fill', '#2c3e50')
      .text(`Bar Chart - ${aggregationType} per ${aggregationPeriod}min`);

    days.forEach((day) => {
      const dayData = dataByDay[day];
      dayData.forEach((bucket) => {
        const modelsToPlot = presentModels.filter(
          (m) => !hiddenAggregatedModels.has(m) && bucket.perModelValues[m] && bucket.perModelValues[m].value > 0
        );
        if (modelsToPlot.length === 0) return;

        const stepH = aggregationPeriod / 60;
        const bucketStartH = bucket.time;
        const bucketEndH = bucketStartH + stepH;
        const xBucketStart = xScale(bucketStartH);
        const xBucketEnd = xScale(bucketEndH);
        const bucketPixelWidth = xBucketEnd - xBucketStart;

        const available = Math.max(0, bucketPixelWidth - 2 * INNER_PAD);
        const modelsN = Math.max(1, modelsToPlot.length);

        let gap = Math.min(
          BASE_BAR_GAP,
          Math.floor((available - modelsN * MIN_BAR_WIDTH) / Math.max(1, modelsN - 1))
        );
        gap = Math.max(MIN_BAR_GAP, gap);

        let barWidth = Math.floor((available - (modelsN - 1) * gap) / modelsN);
        barWidth = Math.max(MIN_BAR_WIDTH, Math.min(MAX_BAR_WIDTH, barWidth));

        let groupWidth = modelsN * barWidth + (modelsN - 1) * gap;
        if (groupWidth > available) {
          gap = Math.max(MIN_BAR_GAP, Math.floor((available - modelsN * barWidth) / Math.max(1, modelsN - 1)));
          groupWidth = modelsN * barWidth + (modelsN - 1) * gap;
        }
        if (groupWidth > available) {
          barWidth = Math.max(MIN_BAR_WIDTH, Math.floor((available - (modelsN - 1) * gap) / modelsN));
          groupWidth = modelsN * barWidth + (modelsN - 1) * gap;
        }

        const xStart = clamp(
          xBucketStart + INNER_PAD + (available - groupWidth) / 2,
          xBucketStart + INNER_PAD,
          xBucketEnd - INNER_PAD - groupWidth
        );
        const yBaseline = yScale(day) + yScale.bandwidth() / 2;

        modelsToPlot.forEach((model, i) => {
          const stats = bucket.perModelValues[model];
          const h = Math.max(1, sqrtScale(stats.value));
          const x = xStart + i * (barWidth + gap);

          const group = chartContainer.append('g');

          group.append('rect')
            .attr('x', x).attr('y', yBaseline - h)
            .attr('width', barWidth).attr('height', h)
            .attr('fill', modelColors[model] || '#888')
            .attr('stroke', '#2c3e50').attr('stroke-width', 0.5)
            .attr('opacity', 0.85).attr('shape-rendering', 'crispEdges');

          group.append('rect')
            .attr('x', x - 2).attr('y', yBaseline - h - 2)
            .attr('width', barWidth + 4).attr('height', h + 4)
            .attr('fill', 'transparent')
            .on('mouseover', (event) => {
              const [winStart, winEnd] = bucketWindow(bucket.day, bucket.time, aggregationPeriod);
              const content =
                `Model: ${model}\n` +
                `Time: ${hhmmUTC(winStart)}–${hhmmUTC(winEnd)}\n` +
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

    drawModelLegend(svg, presentModels, modelColors, hiddenAggregatedModels, toggleAggregatedModel);

    const zoom = d3.zoom()
      .scaleExtent([1, 40])
      .translateExtent([[0, 0], [innerWidth, innerHeight]])
      .extent([[0, 0], [innerWidth, innerHeight]])
      .on('zoom', (event) => {
        const t = event.transform;
        chartContainer.attr('transform', `translate(${t.x},0) scale(${t.k},1)`);
        drawAggAxis(t.rescaleX(xScale));
      });

    const zoomPane = g.append('rect')
      .attr('class', 'zoom-pane')
      .attr('x', 0).attr('y', 0).attr('width', innerWidth).attr('height', innerHeight)
      .style('fill', 'transparent').style('cursor', 'grab').lower();

    zoomPane.call(zoom)
      .on('dblclick.zoom', null)
      .on('mousedown', () => zoomPane.style('cursor', 'grabbing'))
      .on('mouseup', () => zoomPane.style('cursor', 'grab'))
      .on('mouseleave', () => zoomPane.style('cursor', 'grab'));
  };

  return (
    <div style={{ position: 'relative' }}>
      {/* Tabs */}
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

      {/* Blue container */}
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
                style={{ padding: '4px 8px', borderRadius: '4px', border: '1px solid #ddd', fontSize: '11px' }}
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
                style={{ padding: '4px 8px', borderRadius: '4px', border: '1px solid #ddd', fontSize: '11px' }}
              >
                <option value={15}>15 min</option>
                <option value={30}>30 min</option>
                <option value={60}>60 min</option>
              </select>
            </div>
          </div>
        )}

        {/* Saved / Inference legend — Timeline only, HTML overlay so zoom can't affect it */}
{activeTab === 'timeline' && (
  <div
    style={{
      position: 'absolute',
      top: 6,
      right: 16,
      display: 'flex',
      gap: 16,
      zIndex: 11,
      fontSize: 11,
      alignItems: 'center',
      userSelect: 'none',
    }}
  >
    {/* Saved Image */}
    <div
      onClick={() => setShowSavedImage(v => !v)}
      title="Toggle saved image detections"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '6px 10px',
        borderRadius: 8,
        border: '1px solid #dcdfe3',
        background: showSavedImage ? '#ffffff' : '#f7f8f9',
        boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
        cursor: 'pointer',
        opacity: showSavedImage ? 1 : 0.55,
      }}
    >
      {/* swatch — solid bar */}
      <svg width="24" height="10" aria-hidden="true">
        <rect x="2" y="3" width="18" height="4" fill="#93889A" opacity={showSavedImage ? 0.8 : 0.2} />
      </svg>
      <span
        style={{
          color: showSavedImage ? '#2c3e50' : '#9aa1a6',
          fontWeight: showSavedImage ? 700 : 500,
        }}
      >
        Saved Image
      </span>
    </div>

    {/* Inference Only */}
    <div
      onClick={() => setShowInferenceOnly(v => !v)}
      title="Toggle inference-only detections"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '6px 10px',
        borderRadius: 8,
        border: '1px solid #dcdfe3',
        background: showInferenceOnly ? '#ffffff' : '#f7f8f9',
        boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
        cursor: 'pointer',
        opacity: showInferenceOnly ? 1 : 0.55,
      }}
    >
    {/* swatch — dashed stroke bar */}
      <svg width="24" height="10" aria-hidden="true">
        <rect
          x="2"
          y="3"
          width="18"
          height="4"
          fill="#93889A"
          opacity={showInferenceOnly ? 0.6 : 0.2}
          stroke="#333"
          strokeWidth="1"
          strokeDasharray="2,2"
        />
      </svg>
      <span
        style={{
          color: showInferenceOnly ? '#2c3e50' : '#9aa1a6',
          fontWeight: showInferenceOnly ? 700 : 500,
        }}
      >
        Inference Only
      </span>
    </div>
  </div>
)}

        {/* Empty State */}
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

        <svg ref={svgRef} style={{ width: '100%', height: '100%', cursor: 'default' }} />

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
