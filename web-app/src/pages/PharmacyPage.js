import React, { useState, useEffect, useCallback } from 'react';
import {
  Paper, Typography, Box, Tab, Tabs, Grid, Card, CardContent,
  Button, Chip, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField,
  IconButton, Alert, CircularProgress, Divider
} from '@mui/material';
import {
  LocalPharmacy as PharmacyIcon,
  Pending as PendingIcon,
  CheckCircle as CheckCircleIcon,
  Print as PrintIcon,
  Visibility as VisibilityIcon,
  MedicalServices as MedicalServicesIcon
} from '@mui/icons-material';
import API_CONFIG from '../config/api';
import { useNotification } from '../contexts/NotificationContext';
import { printClinicalDocument } from '../utils/printClinicalDocument';
import {
  getMaximumDispensableQuantity,
  getRemainingPrescriptionQuantity,
  isDispenseQuantityValid,
} from '../utils/pharmacy';

const PharmacyPage = () => {
  const { notifySuccess, notifyError } = useNotification();
  const [activeTab, setActiveTab] = useState(0);
  const [loading, setLoading] = useState(false);
  const [prescriptions, setPrescriptions] = useState([]);
  const [selectedPrescription, setSelectedPrescription] = useState(null);
  const [dispenseDialogOpen, setDispenseDialogOpen] = useState(false);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [dispensedQuantities, setDispensedQuantities] = useState({});
  const [statistics, setStatistics] = useState({});
  const [dispensing, setDispensing] = useState(false);

  // Fetch prescriptions
  const fetchPrescriptions = useCallback(async (status = 'pending') => {
    setLoading(true);
    try {
      const response = await fetch(`${API_CONFIG.endpoints.pharmacy.prescriptions}?status=${status}`, {
        headers: API_CONFIG.getAuthHeaders(),
      });
      if (response.ok) {
        const data = await response.json();
        setPrescriptions(data.data || []);
      } else {
        notifyError('Failed to fetch prescriptions');
      }
    } catch (error) {
      console.error('Error fetching prescriptions:', error);
      notifyError('An error occurred while fetching prescriptions');
    } finally {
      setLoading(false);
    }
  }, [notifyError]);

  useEffect(() => {
    const statusMap = ['pending', 'partially-dispensed', 'fully-dispensed'];
    fetchPrescriptions(statusMap[activeTab]);
    fetch(`${API_CONFIG.baseURL}/api/pharmacy/statistics`, { headers: API_CONFIG.getAuthHeaders() })
      .then(response => response.ok ? response.json() : null)
      .then(data => data && setStatistics(data.data || {}))
      .catch(() => {});
  }, [activeTab, fetchPrescriptions]);

  const handleTabChange = (event, newValue) => {
    setActiveTab(newValue);
  };

  const handleOpenDispenseDialog = async (prescription) => {
    try {
      const response = await fetch(`${API_CONFIG.endpoints.pharmacy.prescriptions}/${prescription.id}`, {
        headers: API_CONFIG.getAuthHeaders(),
      });
      if (response.ok) {
        const data = await response.json();
        const prescriptionDetails = data.data;
        
        // Initialize dispensed quantities
        const initialQuantities = {};
        if (prescriptionDetails.items) {
          prescriptionDetails.items.forEach(item => {
            if (item.status !== 'dispensed') {
              initialQuantities[item.id] = {
                dispensed_quantity: getMaximumDispensableQuantity(item),
                notes: item.notes || '',
              };
            }
          });
        }
        setDispensedQuantities(initialQuantities);
        setSelectedPrescription(prescriptionDetails);
        setDispenseDialogOpen(true);
      }
    } catch (error) {
      console.error('Error fetching prescription details:', error);
      notifyError('Failed to load prescription details');
    }
  };

  const handleQuantityChange = (itemId, field, value) => {
    setDispensedQuantities(prev => ({
      ...prev,
      [itemId]: {
        ...prev[itemId],
        [field]: value,
      },
    }));
  };

  const handleDispense = async () => {
    if (!selectedPrescription) return;

    setDispensing(true);
    try {
      let finalPrescriptionStatus = 'fully-dispensed';
      // Update each medication item
      for (const [itemId, dispenseData] of Object.entries(dispensedQuantities)) {
        const dispenseResponse = await fetch(`${API_CONFIG.endpoints.pharmacy.prescriptions}/${selectedPrescription.id}/items/${itemId}/dispense`, {
          method: 'POST',
          headers: API_CONFIG.getAuthHeaders(),
          body: JSON.stringify({
            quantity_dispensed: Number(dispenseData.dispensed_quantity),
            notes: dispenseData.notes,
          }),
        });
        const payload = await dispenseResponse.json().catch(() => ({}));
        if (!dispenseResponse.ok) {
          throw new Error(payload.error || 'Failed to dispense a medication');
        }
        finalPrescriptionStatus = payload.data?.prescription_status || finalPrescriptionStatus;
        setDispensedQuantities(previous => {
          const remainingItems = { ...previous };
          delete remainingItems[itemId];
          return remainingItems;
        });
      }

      notifySuccess(finalPrescriptionStatus === 'fully-dispensed'
        ? 'Medications dispensed. Stock, visit, queue and invoice were updated.'
        : 'Partial supply recorded. The remaining medication stays in the pharmacy queue.');
      setDispenseDialogOpen(false);
      setSelectedPrescription(null);
      setActiveTab(finalPrescriptionStatus === 'fully-dispensed' ? 2 : 1);
    } catch (error) {
      console.error('Error dispensing medications:', error);
      notifyError(error.message || 'An error occurred while dispensing medications');
    } finally {
      setDispensing(false);
    }
  };

  const handleViewPrescription = async (prescription) => {
    try {
      const response = await fetch(`${API_CONFIG.endpoints.pharmacy.prescriptions}/${prescription.id}`, {
        headers: API_CONFIG.getAuthHeaders(),
      });
      if (response.ok) {
        const data = await response.json();
        setSelectedPrescription(data.data);
        setViewDialogOpen(true);
      }
    } catch (error) {
      console.error('Error fetching prescription details:', error);
      notifyError('Failed to load prescription details');
    }
  };

  const getStatusChip = (status) => {
    const safeStatus = status || 'pending';
    const statusConfig = {
      pending: { color: 'warning', icon: <PendingIcon fontSize="small" /> },
      'partially-dispensed': { color: 'info', icon: <PharmacyIcon fontSize="small" /> },
      'fully-dispensed': { color: 'success', icon: <CheckCircleIcon fontSize="small" /> },
    };
    const config = statusConfig[safeStatus] || statusConfig.pending;
    return (
      <Chip
        label={safeStatus.replaceAll('-', ' ').toUpperCase()}
        color={config.color}
        size="small"
        icon={config.icon}
      />
    );
  };

  const hasInvalidDispenseQuantity = Object.entries(dispensedQuantities).some(([itemId, value]) => {
    const item = selectedPrescription?.items?.find(candidate => String(candidate.id) === String(itemId));
    return !item || !isDispenseQuantityValid(item, value.dispensed_quantity);
  });

  return (
    <Box component="section" sx={{ width: '100%', minWidth: 0, mb: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
        <MedicalServicesIcon sx={{ fontSize: 40, mr: 2, color: 'primary.main' }} />
        <Typography variant="h4" component="h1">
          Pharmacy Management
        </Typography>
      </Box>
      <Alert severity="info" sx={{ mb: 3 }}>
        Clinician prescriptions arrive here for stock-controlled dispensing.
        The visit advances only after the prescribed medicines are fully handled.
      </Alert>

      {/* Summary Cards */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={4}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Box>
                  <Typography color="textSecondary" gutterBottom>
                    Pending Prescriptions
                  </Typography>
                  <Typography variant="h4">
                    {statistics.pending_prescriptions || 0}
                  </Typography>
                </Box>
                <PendingIcon sx={{ fontSize: 48, color: 'warning.main', opacity: 0.3 }} />
              </Box>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={4}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Box>
                  <Typography color="textSecondary" gutterBottom>
                    Partially Dispensed
                  </Typography>
                  <Typography variant="h4">
                    {statistics.partial_prescriptions || 0}
                  </Typography>
                </Box>
                <PharmacyIcon sx={{ fontSize: 48, color: 'info.main', opacity: 0.3 }} />
              </Box>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={4}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Box>
                  <Typography color="textSecondary" gutterBottom>
                    Dispensed Today
                  </Typography>
                  <Typography variant="h4">
                    {statistics.dispensed_today || 0}
                  </Typography>
                </Box>
                <CheckCircleIcon sx={{ fontSize: 48, color: 'success.main', opacity: 0.3 }} />
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Tabs */}
      <Paper sx={{ mb: 3 }}>
        <Tabs value={activeTab} onChange={handleTabChange} indicatorColor="primary" textColor="primary">
          <Tab label="Pending" icon={<PendingIcon />} iconPosition="start" />
          <Tab label="Partial" icon={<PharmacyIcon />} iconPosition="start" />
          <Tab label="Dispensed" icon={<CheckCircleIcon />} iconPosition="start" />
        </Tabs>
      </Paper>

      {/* Prescriptions Table */}
      <Paper>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Prescription Number</TableCell>
                <TableCell>Patient</TableCell>
                <TableCell>UHID</TableCell>
                <TableCell>Medications</TableCell>
                <TableCell>Prescribed By</TableCell>
                <TableCell>Prescription Date</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={8} align="center">
                    <CircularProgress />
                  </TableCell>
                </TableRow>
              ) : prescriptions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} align="center">
                    <Typography color="textSecondary">No prescriptions found</Typography>
                  </TableCell>
                </TableRow>
              ) : (
                prescriptions.map((prescription) => (
                  <TableRow key={prescription.id} hover>
                    <TableCell>
                      <Typography variant="body2" fontWeight="bold">
                        {prescription.prescription_number}
                      </Typography>
                    </TableCell>
                    <TableCell>{prescription.patient_name}</TableCell>
                    <TableCell>{prescription.uhid}</TableCell>
                    <TableCell>
                      <Typography variant="body2">
                        {prescription.item_count || 0} medication(s)
                      </Typography>
                    </TableCell>
                    <TableCell>{prescription.doctor_name}</TableCell>
                    <TableCell>
                      {new Date(prescription.prescription_date).toLocaleString()}
                    </TableCell>
                    <TableCell>{getStatusChip(prescription.status)}</TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', gap: 1 }}>
                        {prescription.status === 'pending' && (
                          <Button
                            size="small"
                            variant="contained"
                            color="primary"
                            onClick={() => handleOpenDispenseDialog(prescription)}
                          >
                            Review & Dispense
                          </Button>
                        )}
                        {prescription.status === 'partially-dispensed' && (
                          <Button
                            size="small"
                            variant="contained"
                            color="success"
                            onClick={() => handleOpenDispenseDialog(prescription)}
                          >
                            Dispense
                          </Button>
                        )}
                        {prescription.status === 'fully-dispensed' && (
                          <>
                            <IconButton
                              size="small"
                              color="primary"
                              onClick={() => handleViewPrescription(prescription)}
                            >
                              <VisibilityIcon />
                            </IconButton>
                            <IconButton
                              size="small"
                              color="primary"
                              onClick={async () => {
                                await handleViewPrescription(prescription);
                                window.setTimeout(() => {
                                  try { printClinicalDocument(); } catch (error) { notifyError(error.message); }
                                }, 250);
                              }}
                            >
                              <PrintIcon />
                            </IconButton>
                          </>
                        )}
                      </Box>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      {/* Dispense Dialog */}
      <Dialog
        open={dispenseDialogOpen}
        onClose={() => { if (!dispensing) setDispenseDialogOpen(false); }}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          Dispense Medications - {selectedPrescription?.prescription_number}
          <Typography variant="body2" color="textSecondary">
            Patient: {selectedPrescription?.patient_name} ({selectedPrescription?.uhid})
          </Typography>
        </DialogTitle>
        <DialogContent dividers>
          {selectedPrescription?.items && selectedPrescription.items.length > 0 ? (
            selectedPrescription.items.map((item, index) => (
              <Box key={item.id} sx={{ mb: 3 }}>
                <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
                  {index + 1}. {item.generic_name}{item.brand_name ? ` (${item.brand_name})` : ''}
                  {item.status === 'dispensed' && (
                    <Chip label="Dispensed" color="success" size="small" sx={{ ml: 1 }} />
                  )}
                </Typography>
                <Grid container spacing={2}>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      label="Dosage"
                      fullWidth
                      value={item.dosage || ''}
                      disabled
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      label="Frequency"
                      fullWidth
                      value={item.frequency || ''}
                      disabled
                    />
                  </Grid>
                  <Grid item xs={12} sm={4}>
                    <TextField
                      label="Duration"
                      fullWidth
                      value={item.duration_days ? `${item.duration_days} days` : ''}
                      disabled
                    />
                  </Grid>
                  <Grid item xs={12} sm={4}>
                    <TextField
                      label="Prescribed Quantity"
                      fullWidth
                      value={item.quantity || 0}
                      disabled
                    />
                  </Grid>
                  <Grid item xs={12} sm={4}>
                    <TextField
                      label="Dispensed Quantity"
                      fullWidth
                      type="number"
                      value={item.status === 'dispensed'
                        ? (item.quantity_dispensed || item.dispensed_quantity || 0)
                        : (dispensedQuantities[item.id]?.dispensed_quantity || 0)}
                      onChange={(e) => handleQuantityChange(item.id, 'dispensed_quantity', parseInt(e.target.value) || 0)}
                      required
                      disabled={item.status === 'dispensed' || dispensing}
                      inputProps={{ min: 1, max: getMaximumDispensableQuantity(item) }}
                      error={item.status !== 'dispensed' && !isDispenseQuantityValid(
                        item,
                        dispensedQuantities[item.id]?.dispensed_quantity
                      )}
                      helperText={item.status === 'dispensed'
                        ? 'Already supplied'
                        : `${getRemainingPrescriptionQuantity(item)} remaining · ${item.current_stock || 0} in stock`}
                    />
                  </Grid>
                  <Grid item xs={12}>
                    <TextField
                      label="Pharmacist Notes"
                      fullWidth
                      multiline
                      rows={2}
                      value={dispensedQuantities[item.id]?.notes || ''}
                      onChange={(e) => handleQuantityChange(item.id, 'notes', e.target.value)}
                      placeholder="Any special instructions or notes for the patient..."
                      disabled={item.status === 'dispensed' || dispensing}
                    />
                  </Grid>
                </Grid>
                {index < selectedPrescription.items.length - 1 && <Divider sx={{ mt: 2 }} />}
              </Box>
            ))
          ) : (
            <Alert severity="info">No medication items found for this prescription.</Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDispenseDialogOpen(false)} disabled={dispensing}>Cancel</Button>
          <Button
            variant="contained"
            color="primary"
            onClick={handleDispense}
            disabled={dispensing || Object.keys(dispensedQuantities).length === 0 || hasInvalidDispenseQuantity}
          >
            {dispensing ? <CircularProgress size={20} /> : 'Confirm Dispensing'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* View Prescription Dialog */}
      <Dialog
        open={viewDialogOpen}
        onClose={() => setViewDialogOpen(false)}
        maxWidth="md"
        fullWidth
        PaperProps={{ 'data-print-document': true }}
      >
        <DialogTitle>
          Prescription Details - {selectedPrescription?.prescription_number}
        </DialogTitle>
        <DialogContent dividers>
          {selectedPrescription && (
            <Box>
              <Grid container spacing={2} sx={{ mb: 3 }}>
                <Grid item xs={6}>
                  <Typography variant="body2" color="textSecondary">Patient:</Typography>
                  <Typography variant="body1" fontWeight="bold">
                    {selectedPrescription.patient_name} ({selectedPrescription.uhid})
                  </Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2" color="textSecondary">Prescribed By:</Typography>
                  <Typography variant="body1">{selectedPrescription.doctor_name}</Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2" color="textSecondary">Prescription Date:</Typography>
                  <Typography variant="body1">
                    {new Date(selectedPrescription.prescription_date).toLocaleString()}
                  </Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2" color="textSecondary">Status:</Typography>
                  <Typography variant="body1">{getStatusChip(selectedPrescription.status)}</Typography>
                </Grid>
              </Grid>

              <Divider sx={{ my: 2 }} />

              <Typography variant="h6" gutterBottom>Medications</Typography>
              {selectedPrescription.items && selectedPrescription.items.map((item, index) => (
                <Box key={item.id} sx={{ mb: 2, p: 2, bgcolor: 'grey.50', borderRadius: 1 }}>
                  <Typography variant="subtitle1" fontWeight="bold">{item.drug_name}</Typography>
                  <Grid container spacing={2} sx={{ mt: 1 }}>
                    <Grid item xs={6}>
                      <Typography variant="body2" color="textSecondary">Dosage:</Typography>
                      <Typography variant="body1">{item.dosage || 'N/A'}</Typography>
                    </Grid>
                    <Grid item xs={6}>
                      <Typography variant="body2" color="textSecondary">Frequency:</Typography>
                      <Typography variant="body1">{item.frequency || 'N/A'}</Typography>
                    </Grid>
                    <Grid item xs={4}>
                      <Typography variant="body2" color="textSecondary">Duration:</Typography>
                      <Typography variant="body1">{item.duration || 'N/A'}</Typography>
                    </Grid>
                    <Grid item xs={4}>
                      <Typography variant="body2" color="textSecondary">Prescribed:</Typography>
                      <Typography variant="body1" fontWeight="bold">{item.quantity || 0}</Typography>
                    </Grid>
                    <Grid item xs={4}>
                      <Typography variant="body2" color="textSecondary">Dispensed:</Typography>
                      <Typography variant="body1" fontWeight="bold" color="success.main">
                        {item.dispensed_quantity || 0}
                      </Typography>
                    </Grid>
                    {item.notes && (
                      <Grid item xs={12}>
                        <Typography variant="body2" color="textSecondary">Pharmacist Notes:</Typography>
                        <Typography variant="body2">{item.notes}</Typography>
                      </Grid>
                    )}
                  </Grid>
                </Box>
              ))}
            </Box>
          )}
        </DialogContent>
        <DialogActions data-print-actions>
          <Button onClick={() => setViewDialogOpen(false)}>Close</Button>
          <Button
            variant="contained"
            color="primary"
            startIcon={<PrintIcon />}
            onClick={() => {
              try { printClinicalDocument(); } catch (error) { notifyError(error.message); }
            }}
          >
            Print Label
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default PharmacyPage;

