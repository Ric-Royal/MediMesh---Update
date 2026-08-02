import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  Alert,
  CircularProgress,
  Tabs,
  Tab,
  Paper,
} from '@mui/material';
import { useNotification } from '../../contexts/NotificationContext';
import { useAuth } from '../../contexts/AuthContext';
import API_CONFIG from '../../config/api';

// Import sub-components
import ExaminationSection from './ExaminationSection';
import DiagnosisSection from './DiagnosisSection';
import LabTestsSelector from './LabTestsSelector';
import RadiologyStudiesSelector from './RadiologyStudiesSelector';
import MedicationsSelector from './MedicationsSelector';
import ClinicalContextSection from './ClinicalContextSection';
import {
  CLINICAL_OUTCOMES,
  buildConsultationPayload,
  formatConsultationApiError,
  validateConsultationForm,
} from '../../utils/consultationWorkflow';

const ConsultationForm = ({ open, onClose, encounter, patient, queueEntry, onSuccess }) => {
  const { notifySuccess, notifyError } = useNotification();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState(0);
  const [clinicalContext, setClinicalContext] = useState(null);
  const [contextLoading, setContextLoading] = useState(false);
  const [contextError, setContextError] = useState('');
  const isResultsReview = queueEntry?.service_type === 'results-review';
  
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
    clinicalOutcome: '',
    investigationReason: '',
    // Orders
    labOrders: [],
    radiologyOrders: [],
    prescriptions: [],
  });

  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (!open || !encounter?.id) return;
    let active = true;
    setContextLoading(true);
    setContextError('');
    fetch(`${API_CONFIG.endpoints.consultations}/encounter/${encounter.id}/clinical-context`, {
      headers: API_CONFIG.getAuthHeaders(),
    })
      .then(async response => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Unable to load clinical context');
        if (active) setClinicalContext(result.data);
      })
      .catch(error => {
        if (active) setContextError(error.message);
      })
      .finally(() => {
        if (active) setContextLoading(false);
      });
    return () => { active = false; };
  }, [encounter?.id, open]);

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

  const handleExaminationChange = (examination) => {
    setFormData(prev => ({ ...prev, examination }));
  };

  const handleDiagnosisChange = (diagnosis) => {
    setFormData(prev => {
      const next = { ...prev, ...diagnosis };
      if (prev.prescriptions.length > 0 && (
        next.clinicalOutcome !== CLINICAL_OUTCOMES.DIAGNOSIS_CONFIRMED ||
        !next.finalDiagnosis.trim()
      )) {
        setErrors(current => ({
          ...current,
          prescriptions: 'Remove prescribed medication before clearing the final diagnosis or changing the clinical outcome.'
        }));
        return prev;
      }
      return next;
    });
  };

  const handleLabOrdersChange = (labOrders) => {
    setFormData(prev => {
      if (labOrders.length > 0 && prev.prescriptions.length > 0) {
        setErrors(current => ({
          ...current,
          prescriptions: 'Remove medication before ordering investigations. Medication is prescribed after results review and final diagnosis.'
        }));
        return prev;
      }
      return {
        ...prev,
        labOrders,
        clinicalOutcome: labOrders.length > 0 || prev.radiologyOrders.length > 0
          ? CLINICAL_OUTCOMES.INVESTIGATIONS_PENDING
          : prev.clinicalOutcome,
      };
    });
  };

  const handleRadiologyOrdersChange = (radiologyOrders) => {
    setFormData(prev => {
      if (radiologyOrders.length > 0 && prev.prescriptions.length > 0) {
        setErrors(current => ({
          ...current,
          prescriptions: 'Remove medication before ordering investigations. Medication is prescribed after results review and final diagnosis.'
        }));
        return prev;
      }
      return {
        ...prev,
        radiologyOrders,
        clinicalOutcome: radiologyOrders.length > 0 || prev.labOrders.length > 0
          ? CLINICAL_OUTCOMES.INVESTIGATIONS_PENDING
          : prev.clinicalOutcome,
      };
    });
  };

  const handlePrescriptionsChange = (prescriptions) => {
    if (prescriptions.length > 0 && (
      formData.clinicalOutcome !== CLINICAL_OUTCOMES.DIAGNOSIS_CONFIRMED ||
      !formData.finalDiagnosis.trim() ||
      formData.labOrders.length > 0 ||
      formData.radiologyOrders.length > 0
    )) {
      setErrors(current => ({
        ...current,
        prescriptions: 'Medication becomes available after a final diagnosis and after any investigations are complete.'
      }));
      return;
    }
    setFormData(prev => ({ ...prev, prescriptions }));
  };

  const validateForm = () => {
    const newErrors = validateConsultationForm(formData);
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
      const payload = buildConsultationPayload({
        formData,
        encounter,
        patient,
        doctorId: user?.id,
      });


      const response = await fetch(API_CONFIG.endpoints.consultations, {
        method: 'POST',
        headers: API_CONFIG.getAuthHeaders(),
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(formatConsultationApiError(error));
      }

      const result = await response.json();


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

  const hasDiagnostics = formData.labOrders.length > 0 || formData.radiologyOrders.length > 0;
  const canPrescribe = !hasDiagnostics &&
    formData.clinicalOutcome === CLINICAL_OUTCOMES.DIAGNOSIS_CONFIRMED &&
    formData.finalDiagnosis.trim().length > 0;

  const tabs = [
    { label: isResultsReview ? 'Results & Triage' : 'Triage Summary', component: ClinicalContextSection },
    { label: 'Examination', component: ExaminationSection },
    { label: 'Diagnosis & Plan', component: DiagnosisSection },
    { label: 'Order Lab Tests', component: LabTestsSelector },
    { label: 'Order Imaging', component: RadiologyStudiesSelector },
    {
      label: canPrescribe ? 'Prescribe Medication' : 'Medication (after final diagnosis)',
      component: MedicationsSelector,
      disabled: !canPrescribe,
    },
  ];

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
        {[...new Set(Object.values(errors))].map(message => (
          <Alert key={message} severity="error" sx={{ mb: 2 }}>
            {message}
          </Alert>
        ))}

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
              disabled={tab.disabled}
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
            <ClinicalContextSection
              context={clinicalContext}
              loading={contextLoading}
              error={contextError}
              isResultsReview={isResultsReview}
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
              clinicalOutcome={formData.clinicalOutcome}
              investigationReason={formData.investigationReason}
              hasDiagnostics={hasDiagnostics}
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
              Lab Tests: <strong>{formData.labOrders.length}</strong>
            </Typography>
            <Typography variant="body2">
              Radiology Studies: <strong>{formData.radiologyOrders.length}</strong>
            </Typography>
            <Typography variant="body2">
              Medications: <strong>{formData.prescriptions.length}</strong>
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
          {loading
            ? 'Saving...'
            : isResultsReview
              ? 'Complete Results Review'
              : (formData.labOrders.length || formData.radiologyOrders.length || formData.prescriptions.length)
                ? 'Submit Orders & Hand Off'
                : 'Complete Consultation & Send to Billing'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ConsultationForm;
