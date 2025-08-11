import React, { useState } from 'react';
import { COLORS } from './styles/colors';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { TimePicker } from '@mui/x-date-pickers/TimePicker';
import { TextField, Select, MenuItem, FormControl, InputLabel, Button, Box, Checkbox, FormControlLabel, FormGroup, Alert, Typography } from '@mui/material';
import dayjs from 'dayjs';
import axios from 'axios';
import DetectionFilter from './DetectionFilter';

const LateralMenu = ({ activeTab, setActiveTab, onQueryResults, onModelChange, selectedModels, onDetectionFilterChange }) => {
  const [startDate, setStartDate] = useState(dayjs());
  const [endDate, setEndDate] = useState(dayjs());
  const [startTime, setStartTime] = useState(null);
  const [endTime, setEndTime] = useState(null);
  const [selectedNode, setSelectedNode] = useState('W042');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [detectionFilter, setDetectionFilter] = useState(null);

  const handleQuery = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const queryData = {
        startDate: startDate.format('YYYY-MM-DD'),
        endDate: endDate.format('YYYY-MM-DD'),
        startTime: startTime ? startTime.format('HH:mm') : null,
        endTime: endTime ? endTime.format('HH:mm') : null,
        node: selectedNode,
        models: selectedModels,
        detectionFilter: detectionFilter
      };

      console.log('Sending query:', queryData);
      const response = await axios.post('/api/query', queryData);
      
      if (response.data.success) {
        onQueryResults(response.data.images);
        
        console.log('Query successful:', {
          total: response.data.total,
          stats: response.data.stats,
          images: response.data.images.length
        });
      } else {
        setError(response.data.error || 'Query failed');
      }
    } catch (error) {
      console.error('Query error:', error);
      setError(error.response?.data?.error || error.message || 'Network error');
    } finally {
      setLoading(false);
    }
  };

  const handleModelToggle = (model) => {
    onModelChange(model);
  };

  const handleDetectionFilterChange = (filterConfig) => {
    setDetectionFilter(filterConfig);
    if (onDetectionFilterChange) {
      onDetectionFilterChange(filterConfig);
    }
  };

  const getTimeRangeDescription = () => {
    if (!startTime && !endTime) {
      return "All day (no time filter)";
    }
    const start = startTime ? startTime.format('HH:mm') : '00:00';
    const end = endTime ? endTime.format('HH:mm') : '23:59';
    return `${start} - ${end}`;
  };

  return (
    <div className="lateral-menu" style={{ backgroundColor: COLORS.purple }}>
      <div className="tab-navigation">
        <button
          className={`tab ${activeTab === 'filter' ? 'active' : ''}`}
          onClick={() => setActiveTab('filter')}
        >
          Filter
        </button>
        <button
          className={`tab ${activeTab === 'llm' ? 'active' : ''}`}
          onClick={() => setActiveTab('llm')}
        >
          LLM
        </button>
      </div>
      
      <div className="tab-content">
        {activeTab === 'filter' ? (
          <LocalizationProvider dateAdapter={AdapterDayjs}>
            <div className="filter-content">
              <h3>Data Query</h3>
              
              {error && (
                <Alert severity="error" sx={{ mb: 2, fontSize: '0.8rem' }}>
                  {error}
                </Alert>
              )}
              
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {/* Model Selection */}
                <FormControl component="fieldset" variant="standard">
                  <InputLabel sx={{ position: 'static', transform: 'none', marginBottom: 1, fontSize: '0.9rem' }}>
                    Detection Models
                  </InputLabel>
                  <FormGroup>
                    {['YOLOv5n', 'YOLOv8n', 'YOLOv10n'].map((model) => (
                      <FormControlLabel
                        key={model}
                        control={
                          <Checkbox 
                            checked={selectedModels.includes(model)}
                            onChange={() => handleModelToggle(model)}
                            name={model}
                            size="small"
                          />
                        }
                        label={<span style={{ fontSize: '0.85rem' }}>{model}</span>}
                      />
                    ))}
                  </FormGroup>
                </FormControl>

                {/* Node Selection */}
                <FormControl size="small" fullWidth>
                  <InputLabel>Node</InputLabel>
                  <Select
                    value={selectedNode}
                    label="Node"
                    onChange={(e) => setSelectedNode(e.target.value)}
                  >
                    <MenuItem value="W042">W042</MenuItem>
                    <MenuItem value="W043">W043</MenuItem>
                    <MenuItem value="W044">W044</MenuItem>
                  </Select>
                </FormControl>

                {/* Date Range */}
                <DatePicker
                  label="Start Date"
                  value={startDate}
                  onChange={(newValue) => setStartDate(newValue)}
                  slotProps={{ textField: { size: 'small', fullWidth: true } }}
                />
                
                <DatePicker
                  label="End Date"
                  value={endDate}
                  onChange={(newValue) => setEndDate(newValue)}
                  slotProps={{ textField: { size: 'small', fullWidth: true } }}
                />

                {/* Time Range (Optional) */}
                <TimePicker
                  label="Start Time (Optional)"
                  value={startTime}
                  onChange={(newValue) => setStartTime(newValue)}
                  slotProps={{ textField: { size: 'small', fullWidth: true } }}
                />
                
                <TimePicker
                  label="End Time (Optional)"
                  value={endTime}
                  onChange={(newValue) => setEndTime(newValue)}
                  slotProps={{ textField: { size: 'small', fullWidth: true } }}
                />

                {/* Detection Filter */}
                <DetectionFilter 
                  onFilterChange={handleDetectionFilterChange}
                  currentFilter={detectionFilter}
                />

                <Button
                  variant="contained"
                  onClick={handleQuery}
                  disabled={loading || selectedModels.length === 0}
                  sx={{
                    backgroundColor: COLORS.purple,
                    '&:hover': {
                      backgroundColor: COLORS.purple,
                      opacity: 0.8
                    }
                  }}
                >
                  {loading ? 'Querying...' : 'Query Data'}
                </Button>

                {selectedModels.length === 0 && (
                  <Alert severity="warning" sx={{ fontSize: '0.8rem' }}>
                    Please select at least one detection model
                  </Alert>
                )}

                {/* Query Summary */}
                {(detectionFilter || getTimeRangeDescription() !== "All day (no time filter)") && (
                  <Box sx={{ mt: 1, p: 1, bgcolor: '#f5f5f5', borderRadius: 1 }}>
                    <Typography variant="caption" sx={{ fontSize: '0.75rem', color: '#666' }}>
                      <strong>Query Summary:</strong><br/>
                      Time: {getTimeRangeDescription()}<br/>
                      {detectionFilter && `Filter: ${detectionFilter.type === 'custom' ? `${detectionFilter.conditions.length} custom conditions` : 'Unknown filter'}`}
                    </Typography>
                  </Box>
                )}
              </Box>
            </div>
          </LocalizationProvider>
        ) : (
          <div className="llm-content">
            <h3>LLM Assistant</h3>
            <p>Ask questions about your detection data</p>
            <textarea
              className="llm-input"
              placeholder="Ask something about the detection results..."
              rows={4}
            />
            <button className="query-button">
              Send Query
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default LateralMenu;