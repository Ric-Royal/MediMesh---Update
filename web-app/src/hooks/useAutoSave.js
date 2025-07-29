import { useEffect } from 'react';
import { useSettings } from '../contexts/SettingsContext';

export const useAutoSave = (formData, saveFunction, delay = 30000) => {
  const { isMedicalFeatureEnabled } = useSettings();
  
  useEffect(() => {
    if (!isMedicalFeatureEnabled('autoSaveDrafts')) {
      return;
    }

    const autoSaveTimer = setInterval(() => {
      if (formData && Object.keys(formData).length > 0) {
        try {
          // Save to localStorage as backup
          localStorage.setItem('medimesh_autosave_draft', JSON.stringify({
            data: formData,
            timestamp: Date.now(),
            url: window.location.pathname
          }));
          
          // Optionally call the save function
          if (saveFunction) {
            saveFunction(formData, { isAutoSave: true });
          }
        } catch (error) {
          console.error('Auto-save failed:', error);
        }
      }
    }, delay);

    return () => clearInterval(autoSaveTimer);
  }, [formData, saveFunction, delay, isMedicalFeatureEnabled]);
}; 