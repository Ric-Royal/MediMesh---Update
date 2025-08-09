import { useEffect } from 'react';
import { useSettings } from '../contexts/SettingsContext';

/**
 * Custom hook for auto-saving form data based on user preferences
 * @param {Object} formData - The form data to auto-save
 * @param {Function} saveFunction - Function to call for saving
 * @param {number} delay - Delay in milliseconds before auto-saving (default: 30000)
 */
export const useAutoSave = (formData, saveFunction, delay = 30000) => {
  const { isMedicalFeatureEnabled } = useSettings();
  
  useEffect(() => {
    // Only auto-save if the feature is enabled
    if (!isMedicalFeatureEnabled('autoSaveDrafts')) {
      return;
    }
    
    // Only proceed if we have data to save
    if (!formData || Object.keys(formData).length === 0) {
      return;
    }
    
    // Set up auto-save timer
    const timeoutId = setTimeout(() => {
      try {
        saveFunction(formData);
        console.log('Auto-save completed');
      } catch (error) {
        console.error('Auto-save failed:', error);
      }
    }, delay);
    
    // Cleanup function to clear timeout
    return () => clearTimeout(timeoutId);
  }, [formData, saveFunction, delay, isMedicalFeatureEnabled]);
};

export default useAutoSave; 