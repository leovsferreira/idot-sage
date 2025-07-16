import React, { useState } from 'react';
import { COLORS } from './styles/colors';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { TimePicker } from '@mui/x-date-pickers/TimePicker';
import { TextField, Select, MenuItem, FormControl, InputLabel, Button, Box, Checkbox, FormControlLabel, FormGroup } from '@mui/material';
import dayjs from 'dayjs';
import axios from 'axios';

const LateralMenu = ({ activeTab, setActiveTab, onQueryResults, onModelChange, selectedModels }) => {
  const [startDate, setStartDate] = useState(dayjs());
  const [endDate, setEndDate] = useState(dayjs());
  const [startTime, setStartTime] = useState(null);
  const [endTime, setEndTime] = useState(null);
  const [selectedNode, setSelectedNode] = useState('W042');
  const [loading, setLoading] = useState(false);

  const handleQuery = async () => {
    setLoading(true);
    try {
      const queryData = {
        startDate: startDate.format('YYYY-MM-DD'),
        endDate: endDate.format('YYYY-MM-DD'),
        startTime: startTime ? startTime.format('HH:mm') : null,
        endTime: endTime ? endTime.format('HH:mm') : null,
        node: selectedNode,
        models: selectedModels
      };

      const response = await axios.post('/api/query', queryData);
      
      if (response.data.success) {
        onQueryResults(response.data.images);
      }
    } catch (error) {
      console.error('Query error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleModelToggle = (model) => {
    onModelChange(model);
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
              <h3>Filters</h3>
              
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {/* Model Selection */}
                <FormControl component="fieldset" variant="standard">
                  <InputLabel sx={{ position: 'static', transform: 'none', marginBottom: 1 }}>
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
                        label={model}
                      />
                    ))}
                  </FormGroup>
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

                {/* Node Selection */}
                <FormControl size="small" fullWidth>
                  <InputLabel>Node</InputLabel>
                  <Select
                    value={selectedNode}
                    label="Node"
                    onChange={(e) => setSelectedNode(e.target.value)}
                  >
                    <MenuItem value="W042">W042</MenuItem>
                    <MenuItem value="W065">W065</MenuItem>
                    <MenuItem value="W06E">W06E</MenuItem>
                  </Select>
                </FormControl>

                {/* Query Button */}
                <Button
                  variant="contained"
                  onClick={handleQuery}
                  disabled={loading || selectedModels.length === 0}
                  sx={{ 
                    backgroundColor: COLORS.beige,
                    color: '#333',
                    '&:hover': {
                      backgroundColor: COLORS.beige,
                      opacity: 0.8
                    }
                  }}
                >
                  {loading ? 'Querying...' : 'Execute Query'}
                </Button>
              </Box>
            </div>
          </LocalizationProvider>
        ) : (
          <div className="llm-content">
            <h3>LLM Query</h3>
            <p>Natural language query interface</p>
            <textarea 
              className="llm-input"
              placeholder="Ask about your snapshots in natural language..."
              rows="4"
            />
            <button className="query-button">Send Query</button>
          </div>
        )}
      </div>
    </div>
  );
}

export default LateralMenu;