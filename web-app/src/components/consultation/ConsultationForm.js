import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Stepper,
  Step,
  StepLabel,
  Typography,
  Alert,
  CircularProgress,
  Tabs,
  Tab,
  Paper,
} from '@mui/material';
import { useNotification } from '../../contexts/NotificationContext';
import API_CONFIG from '../../config/api';

// Import sub-components
import VitalsSection from './VitalsSection';
import ExaminationSection from './ExaminationSection';
import DiagnosisSection from './DiagnosisSection';
import LabTestsSelector from './LabTestsSelector';
import RadiologyStudiesSelector from './RadiologyStudiesSelector';
import MedicationsSelector from './MedicationsSelector';

const ConsultationForm = ({ open, onClose, encounter, patient, onSuccess }) => {
  const { notifySuccess, notifyError } = useNotification();
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState(0);
  
  // Form data state
  const [formData, setFormData] = useState({
    // Vitals
    vitals: {
      bloodPressure: '',
      temperature: '',
      pulse: '',
      respiratoryRate: '',
      oxygenSaturation: '',
      weight: '',
      height: '',
      bmi: '',
    },
    // Clinical Information
    chiefComplaint: encounter?.chief_complaint || '',
    historyPresentIllness: '',
    pastMedicalHistory: '',
    familyHistory: '',
    socialHistory: '',
    allergies: '',
    currentMedications: '',
    // Physical Examination
    examination: {
      generalAppearance: '',
      cardiovascular: '',
      respiratory: '',
      abdominal: '',
      neurological: '',
      musculoskeletal: '',
      skin: '',
      other: '',
    },
    // Assessment and Plan
    provisionalDiagnosis: '',
    differentialDiagnosis: '',
    finalDiagnosis: '',
    treatmentPlan: '',
    followUpInstructions: '',
    // Orders
    labOrders: [],
    radiologyOrders: [],
    prescriptions: [],
  });

  const [errors, setErrors] = useState({});

  // Calculate BMI when weight or height changes
  useEffect(() => {
    const weight = parseFloat(formData.vitals.weight);
    const height = parseFloat(formData.vitals.height);
    if (weight && height && height > 0) {
      const heightInMeters = height / 100;
      const bmi = (weight / (heightInMeters * heightInMeters)).toFixed(1);
      setFormData(prev => ({
        ...prev,
        vitals: { ...prev.vitals, bmi }
      }));
    }
  }, [formData.vitals.weight, formData.vitals.height]);

  const handleVitalsChange = (vitals) => {
    setFormData(prev => ({ ...prev, vitals }));
  };

  const handleExaminationChange = (examination) => {
    setFormData(prev => ({ ...prev, examination }));
  };

  const handleDiagnosisChange = (diagnosis) => {
    setFormData(prev => ({ ...prev, ...diagnosis }));
  };

  const handleLabOrdersChange = (labOrders) => {
    setFormData(prev => ({ ...prev, labOrders }));
  };

  const handleRadiologyOrdersChange = (radiologyOrders) => {
    setFormData(prev => ({ ...prev, radiologyOrders }));
  };

  const handlePrescriptionsChange = (prescriptions) => {
    setFormData(prev => ({ ...prev, prescriptions }));
  };

  const validateForm = () => {
    const newErrors = {};

    // At least one of the following must be filled
    if (!formData.provisionalDiagnosis && !formData.finalDiagnosis) {
      newErrors.diagnosis = 'Please enter at least a provisional or final diagnosis';
    }

    // If ordering services, must have a diagnosis
    if ((formData.labOrders.length > 0 || formData.radiologyOrders.length > 0 || formData.prescriptions.length > 0) 
        && !formData.provisionalDiagnosis && !formData.finalDiagnosis) {
      newErrors.orders = 'Diagnosis required when ordering services';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validateForm()) {
      notifyError('Please fill in all required fields');
      return;
    }

    setLoading(true);

    try {
      const payload = {
        encounterId: encounter.id,
        patientId: patient.id,
        doctorId: encounter.doctor_id || localStorage.getItem('userId'),
        ...formData,
      };

      console.log('Submitting consultation:', payload);

      const response = await fetch(API_CONFIG.endpoints.consultations, {
        method: 'POST',
        headers: API_CONFIG.getAuthHeaders(),
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create consultation');
      }

      const result = await response.json();

      console.log('Consultation created:', result);

      // Build success message
      let message = 'Consultation completed successfully';
      const ordersCreated = [];
      
      if (result.data.orders.labOrders.length > 0) {
        ordersCreated.push(`Lab Order: ${result.data.orders.labOrders[0].orderNumber}`);
      }
      if (result.data.orders.radiologyOrders.length > 0) {
        ordersCreated.push(`Radiology Order: ${result.data.orders.radiologyOrders[0].orderNumber}`);
      }
      if (result.data.orders.prescriptions.length > 0) {
        ordersCreated.push(`Prescription: ${result.data.orders.prescriptions[0].prescriptionNumber}`);
      }

      if (ordersCreated.length > 0) {
        message += '\n\nOrders Created:\n' + ordersCreated.join('\n');
      }

      notifySuccess(message);
      
      if (onSuccess) {
        onSuccess(result.data);
      }

      onClose();
    } catch (error) {
      console.error('Error creating consultation:', error);
      notifyError(error.message || 'Failed to create consultation');
    } finally {
      setLoading(false);
    }
  };

  const tabs = [
    { label: 'Vitals & History', component: VitalsSection },
    { label: 'Examination', component: ExaminationSection },
    { label: 'Diagnosis & Plan', component: DiagnosisSection },
    { label: 'Lab Tests', component: LabTestsSelector },
    { label: 'Radiology', component: RadiologyStudiesSelector },
    { label: 'Medications', component: MedicationsSelector },
  ];

  const CurrentTabComponent = tabs[activeTab].component;

  return (
    <Dialog 
      open={open} 
      onClose={onClose} 
      maxWidth="lg" 
      fullWidth
      PaperProps={{
        sx: { height: '90vh' }
      }}
    >
      <DialogTitle>
        <Box display="flex" justifyContent="space-between" alignItems="center">
          <Typography variant="h5">
            Consultation - {patient?.first_name} {patient?.last_name}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            UHID: {patient?.uhid}
          </Typography>
        </Box>
      </DialogTitle>

      <DialogContent dividers>
        {errors.diagnosis && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {errors.diagnosis}
          </Alert>
        )}
        {errors.orders && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {errors.orders}
          </Alert>
        )}

        <Tabs
          value={activeTab}
          onChange={(e, newValue) => setActiveTab(newValue)}
          variant="scrollable"
          scrollButtons="auto"
          sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}
        >
          {tabs.map((tab, index) => (
            <Tab 
              key={index} 
              label={
                <Box display="flex" alignItems="center" gap={1}>
                  {tab.label}
                  {index === 3 && formData.labOrders.length > 0 && (
                    <Box 
                      component="span" 
                      sx={{ 
                        bgcolor: 'primary.main', 
                        color: 'white', 
                        borderRadius: '50%', 
                        width: 20, 
                        height: 20, 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'center', 
                        fontSize: '0.75rem' 
                      }}
                    >
                      {formData.labOrders.length}
                    </Box>
                  )}
                  {index === 4 && formData.radiologyOrders.length > 0 && (
                    <Box 
                      component="span" 
                      sx={{ 
                        bgcolor: 'primary.main', 
                        color: 'white', 
                        borderRadius: '50%', 
                        width: 20, 
                        height: 20, 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'center', 
                        fontSize: '0.75rem' 
                      }}
                    >
                      {formData.radiologyOrders.length}
                    </Box>
                  )}
                  {index === 5 && formData.prescriptions.length > 0 && (
                    <Box 
                      component="span" 
                      sx={{ 
                        bgcolor: 'primary.main', 
                        color: 'white', 
                        borderRadius: '50%', 
                        width: 20, 
                        height: 20, 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'center', 
                        fontSize: '0.75rem' 
                      }}
                    >
                      {formData.prescriptions.length}
                    </Box>
                  )}
                </Box>
              }
            />
          ))}
        </Tabs>

        <Box sx={{ minHeight: 400 }}>
          {activeTab === 0 && (
            <VitalsSection
              vitals={formData.vitals}
              chiefComplaint={formData.chiefComplaint}
              historyPresentIllness={formData.historyPresentIllness}
              pastMedicalHistory={formData.pastMedicalHistory}
              familyHistory={formData.familyHistory}
              socialHistory={formData.socialHistory}
              allergies={formData.allergies}
              currentMedications={formData.currentMedications}
              onChange={(data) => setFormData(prev => ({ ...prev, ...data }))}
            />
          )}
          {activeTab === 1 && (
            <ExaminationSection
              examination={formData.examination}
              onChange={handleExaminationChange}
            />
          )}
          {activeTab === 2 && (
            <DiagnosisSection
              provisionalDiagnosis={formData.provisionalDiagnosis}
              differentialDiagnosis={formData.differentialDiagnosis}
              finalDiagnosis={formData.finalDiagnosis}
              treatmentPlan={formData.treatmentPlan}
              followUpInstructions={formData.followUpInstructions}
              onChange={handleDiagnosisChange}
            />
          )}
          {activeTab === 3 && (
            <LabTestsSelector
              selectedTests={formData.labOrders}
              onChange={handleLabOrdersChange}
            />
          )}
          {activeTab === 4 && (
            <RadiologyStudiesSelector
              selectedStudies={formData.radiologyOrders}
              onChange={handleRadiologyOrdersChange}
            />
          )}
          {activeTab === 5 && (
            <MedicationsSelector
              selectedMedications={formData.prescriptions}
              onChange={handlePrescriptionsChange}
            />
          )}
        </Box>

        {/* Summary Box */}
        <Paper elevation={2} sx={{ mt: 3, p: 2, bgcolor: 'primary.light' }}>
          <Typography variant="subtitle2" gutterBottom>
            Orders Summary:
          </Typography>
          <Box display="flex" gap={3}>
            <Typography variant="body2">
              🔬 Lab Tests: <strong>{formData.labOrders.length}</strong>
            </Typography>
            <Typography variant="body2">
              📷 Radiology Studies: <strong>{formData.radiologyOrders.length}</strong>
            </Typography>
            <Typography variant="body2">
              💊 Medications: <strong>{formData.prescriptions.length}</strong>
            </Typography>
          </Box>
        </Paper>
      </DialogContent>

      <DialogActions sx={{ p: 2, gap: 1 }}>
        <Button onClick={onClose} disabled={loading}>
          Cancel
        </Button>
        {activeTab > 0 && (
          <Button onClick={() => setActiveTab(activeTab - 1)} disabled={loading}>
            Previous
          </Button>
        )}
        {activeTab < tabs.length - 1 && (
          <Button 
            onClick={() => setActiveTab(activeTab + 1)} 
            variant="outlined"
            disabled={loading}
          >
            Next
          </Button>
        )}
        <Button
          onClick={handleSubmit}
          variant="contained"
          color="primary"
          disabled={loading}
          startIcon={loading && <CircularProgress size={20} />}
        >
          {loading ? 'Saving...' : 'Complete & Order Services'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ConsultationForm;

