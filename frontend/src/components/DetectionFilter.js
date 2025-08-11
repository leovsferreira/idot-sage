import React, { useState } from 'react';
import { 
  Box, 
  Typography, 
  Accordion, 
  AccordionSummary, 
  AccordionDetails,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  Button,
  Chip,
  IconButton,
  Alert
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import AddIcon from '@mui/icons-material/Add';
import { TRAFFIC_CLASSES, CLASS_GROUPS, OPERATORS } from '../utils/trafficClasses';

const DetectionFilter = ({ onFilterChange, currentFilter = null }) => {
  const [customConditions, setCustomConditions] = useState([]);
  const [newCondition, setNewCondition] = useState({
    class: '',
    operator: '>=',
    count: 1
  });

  const handleAddCustomCondition = () => {
    if (!newCondition.class) return;
    
    const updatedConditions = [...customConditions, { ...newCondition, id: Date.now() }];
    setCustomConditions(updatedConditions);
    
    onFilterChange({
      type: 'custom',
      conditions: updatedConditions
    });
    
    setNewCondition({
      class: '',
      operator: '>=',
      count: 1
    });
  };

  const handleRemoveCondition = (conditionId) => {
    const updatedConditions = customConditions.filter(c => c.id !== conditionId);
    setCustomConditions(updatedConditions);
    
    if (updatedConditions.length === 0) {
      onFilterChange(null);
    } else {
      onFilterChange({
        type: 'custom',
        conditions: updatedConditions
      });
    }
  };

  const handleClearAll = () => {
    setCustomConditions([]);
    onFilterChange(null);
  };

  const getActiveFilterDescription = () => {
    if (customConditions.length > 0) {
      return `${customConditions.length} condition${customConditions.length > 1 ? 's' : ''} active`;
    }
    return 'No detection filter applied';
  };

  return (
    <Box sx={{ mt: 2 }}>
      <Accordion>
        <AccordionSummary
          expandIcon={<ExpandMoreIcon />}
          aria-controls="detection-filter-content"
          id="detection-filter-header"
        >
          <Box sx={{ width: '100%' }}>
            <Typography variant="h6" sx={{ fontSize: '1rem', fontWeight: 500 }}>
              Detection Filters
            </Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: '0.8rem' }}>
              {getActiveFilterDescription()}
            </Typography>
          </Box>
        </AccordionSummary>
        
        <AccordionDetails>
          {/* Clear All Button */}
          {customConditions.length > 0 && (
            <Box sx={{ mb: 2 }}>
              <Button 
                variant="outlined" 
                size="small" 
                onClick={handleClearAll}
                color="error"
              >
                Clear All Filters
              </Button>
            </Box>
          )}

          {/* Active Custom Conditions */}
          {customConditions.length > 0 && (
            <Box sx={{ mb: 2 }}>
              <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600, fontSize: '0.9rem' }}>
                Active Conditions
              </Typography>
              {customConditions.map(condition => (
                <Chip
                  key={condition.id}
                  label={`${condition.class} ${condition.operator} ${condition.count}`}
                  onDelete={() => handleRemoveCondition(condition.id)}
                  size="small"
                  sx={{ mr: 1, mb: 1 }}
                  color="primary"
                  variant="outlined"
                />
              ))}
            </Box>
          )}

          {/* Add New Condition */}
          <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600, fontSize: '0.9rem' }}>
            Add Condition
          </Typography>
          
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-end', flexWrap: 'wrap', mb: 2 }}>
            <FormControl size="small" sx={{ minWidth: 140 }}>
              <InputLabel>Class</InputLabel>
              <Select
                value={newCondition.class}
                label="Class"
                onChange={(e) => setNewCondition(prev => ({...prev, class: e.target.value}))}
              >
                {Object.entries(CLASS_GROUPS).map(([groupName, classes]) => [
                  <MenuItem key={groupName} disabled sx={{ fontWeight: 'bold', fontSize: '0.8rem' }}>
                    {groupName}
                  </MenuItem>,
                  ...classes.map(className => (
                    <MenuItem key={className} value={className} sx={{ pl: 3, fontSize: '0.85rem' }}>
                      {className}
                    </MenuItem>
                  ))
                ])}
              </Select>
            </FormControl>

            <FormControl size="small" sx={{ minWidth: 100 }}>
              <InputLabel>Operator</InputLabel>
              <Select
                value={newCondition.operator}
                label="Operator"
                onChange={(e) => setNewCondition(prev => ({...prev, operator: e.target.value}))}
              >
                {OPERATORS.map(op => (
                  <MenuItem key={op.value} value={op.value} sx={{ fontSize: '0.85rem' }}>
                    {op.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <TextField
              size="small"
              label="Count"
              type="number"
              value={newCondition.count}
              onChange={(e) => setNewCondition(prev => ({...prev, count: parseInt(e.target.value) || 1}))}
              inputProps={{ min: 0, max: 50 }}
              sx={{ width: 80 }}
            />

            <IconButton 
              color="primary" 
              onClick={handleAddCustomCondition}
              disabled={!newCondition.class}
              size="small"
            >
              <AddIcon />
            </IconButton>
          </Box>

          {/* Help Text */}
          <Alert severity="info" sx={{ fontSize: '0.75rem' }}>
            <Typography variant="body2" sx={{ fontSize: '0.75rem' }}>
              <strong>How it works:</strong> Detection filters will only show images/data where ALL conditions are met. 
              For example, "car ≥ 2 AND person ≥ 1" will only show scenes with at least 2 cars AND at least 1 person.
            </Typography>
          </Alert>
        </AccordionDetails>
      </Accordion>
    </Box>
  );
};

export default DetectionFilter;