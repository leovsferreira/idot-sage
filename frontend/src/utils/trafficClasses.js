export const TRAFFIC_CLASSES = {
    'person': 0,
    'bicycle': 1,
    'motorcycle': 3,
    
    'car': 2,
    'bus': 5,
    'train': 7,
    'truck': 8,
  };
  
  export const CLASS_GROUPS = {
    'People and Mobility': ['person', 'bicycle', 'motorcycle'],
    'Vehicles': ['car', 'bus', 'train', 'truck'],
  };
  
  export const OPERATORS = [
    { value: '>=', label: 'At least' },
    { value: '=', label: 'Exactly' },
    { value: '<=', label: 'At most' },
    { value: '>', label: 'More than' },
    { value: '<', label: 'Less than' }
  ];
  
  export const matchesFilterConditions = (detectionsData, conditions) => {
    if (!conditions || conditions.length === 0) return true;
    if (!detectionsData) return false;
    
    return conditions.every(condition => {
      if (condition.combineClasses && condition.classes) {
        const totalCount = condition.classes.reduce((sum, className) => {
          return sum + (detectionsData[className] || 0);
        }, 0);
        return evaluateCondition(totalCount, condition.operator, condition.count);
      } else if (condition.class) {
        const classCount = detectionsData[condition.class] || 0;
        return evaluateCondition(classCount, condition.operator, condition.count);
      }
      return false;
    });
  };
  
  const evaluateCondition = (actualCount, operator, expectedCount) => {
    switch (operator) {
      case '>=': return actualCount >= expectedCount;
      case '=': return actualCount === expectedCount;
      case '<=': return actualCount <= expectedCount;
      case '>': return actualCount > expectedCount;
      case '<': return actualCount < expectedCount;
      default: return false;
    }
  };
  
  export const applyDetectionFilters = (images, filterConfig) => {
    if (!filterConfig || !filterConfig.conditions) {
      return images;
    }
  
    return images.filter(image => {
      if (!image.models_results) return false;
  
      return Object.values(image.models_results).some(modelResults => {
        if (!modelResults.counts) return false;
        return matchesFilterConditions(modelResults.counts, filterConfig.conditions);
      });
    });
  };
  
  export const getFilterSummary = (filterConfig) => {
    if (!filterConfig) return 'No detection filters';
    
    if (filterConfig.type === 'custom') {
      const conditionCount = filterConfig.conditions.length;
      return `${conditionCount} condition${conditionCount > 1 ? 's' : ''}`;
    }
    
    return 'Unknown filter';
  };