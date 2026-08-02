import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Grid,
  Card,
  CardContent,
  CardActions,
  Button,
  Chip,
  TextField,
  InputAdornment,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Alert,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material';
import {
  Search as SearchIcon,
  Add as AddIcon,
  Delete as DeleteIcon,
  Medication as MedicationIcon,
  Edit as EditIcon,
} from '@mui/icons-material';
import API_CONFIG from '../../config/api';

const MedicationsSelector = ({ selectedMedications, onChange, canPrescribe = true }) => {
  const [drugCatalog, setDrugCatalog] = useState([]);
  const [filteredDrugs, setFilteredDrugs] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingMedication, setEditingMedication] = useState(null);
  const [editError, setEditError] = useState('');

  // Fetch drug catalog
  useEffect(() => {
    const fetchDrugCatalog = async () => {
      try {
        const response = await fetch(API_CONFIG.endpoints.pharmacy.drugs, {
          headers: API_CONFIG.getAuthHeaders(),
        });

        if (response.ok) {
          const data = await response.json();
          setDrugCatalog(data.data || []);
          setFilteredDrugs(data.data || []);
        } else {
          console.error('Failed to fetch drug catalog');
        }
      } catch (error) {
        console.error('Error fetching drug catalog:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchDrugCatalog();
  }, []);

  // Filter drugs based on search and category
  useEffect(() => {
    let filtered = drugCatalog;

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(drug =>
        (drug.generic_name || '').toLowerCase().includes(term) ||
        (drug.brand_name || '').toLowerCase().includes(term) ||
        (drug.drug_code || '').toLowerCase().includes(term)
      );
    }

    if (categoryFilter !== 'all') {
      filtered = filtered.filter(drug => drug.category_name === categoryFilter);
    }

    setFilteredDrugs(filtered);
  }, [searchTerm, categoryFilter, drugCatalog]);

  const categories = [...new Set(drugCatalog.map(drug => drug.category_name).filter(Boolean))];

  const handleAddMedication = (drug) => {
    if (!canPrescribe) return;
    // Check if already added
    if (selectedMedications.find(m => m.drugId === drug.id)) {
      return;
    }

    const newMedication = {
      drugId: drug.id,
      drugName: drug.brand_name || drug.generic_name,
      drugCode: drug.drug_code,
      genericName: drug.generic_name,
      dosage: drug.strength || '',
      frequency: 'TID',
      durationDays: 7,
      quantity: 21,
      instructions: 'Take with food',
      unitPrice: parseFloat(drug.unit_price) || 0,
      totalPrice: 0,
    };

    // Calculate total price
    newMedication.totalPrice = newMedication.quantity * newMedication.unitPrice;

    setEditingMedication(newMedication);
    setEditError('');
    setEditDialogOpen(true);
  };

  const handleSaveEdit = () => {
    if (editingMedication) {
      if (
        !editingMedication.dosage?.trim() ||
        !editingMedication.frequency?.trim() ||
        !Number.isInteger(editingMedication.durationDays) ||
        editingMedication.durationDays < 1 ||
        editingMedication.durationDays > 365 ||
        !Number.isInteger(editingMedication.quantity) ||
        editingMedication.quantity < 1
      ) {
        setEditError('Enter dosage, frequency, a duration from 1 to 365 days, and a quantity of at least 1.');
        return;
      }

      // Recalculate total price
      editingMedication.totalPrice = editingMedication.quantity * editingMedication.unitPrice;

      const existing = selectedMedications.find(m => m.drugId === editingMedication.drugId);
      if (existing) {
        // Update existing
        onChange(
          selectedMedications.map(m =>
            m.drugId === editingMedication.drugId ? editingMedication : m
          )
        );
      } else {
        // Add new
        onChange([...selectedMedications, editingMedication]);
      }
    }
    setEditDialogOpen(false);
    setEditingMedication(null);
    setEditError('');
  };

  const handleRemoveMedication = (drugId) => {
    onChange(selectedMedications.filter(med => med.drugId !== drugId));
  };

  const handleEditMedication = (medication) => {
    setEditingMedication({ ...medication });
    setEditError('');
    setEditDialogOpen(true);
  };

  const totalCost = selectedMedications.reduce((sum, med) => sum + (med.totalPrice || 0), 0);

  return (
    <Box>
      <Typography variant="h6" gutterBottom>
        Medications & Prescriptions
      </Typography>

      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Select medications to prescribe. You can specify dosage, frequency, and duration for each.
      </Typography>

      {!canPrescribe && (
        <Alert severity="info" sx={{ mb: 3 }}>
          Medication is optional. To prescribe it, first enter the final diagnosis and select
          “Final diagnosis established” under Diagnosis &amp; Plan. If tests or imaging are being
          ordered, prescribe after those results return.
        </Alert>
      )}

      {/* Selected Medications Summary */}
      {selectedMedications.length > 0 && (
        <Paper elevation={2} sx={{ p: 2, mb: 3, bgcolor: 'secondary.light' }}>
          <Typography variant="subtitle2" gutterBottom>
            Selected Medications ({selectedMedications.length})
          </Typography>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell><strong>Medication</strong></TableCell>
                  <TableCell><strong>Dosage</strong></TableCell>
                  <TableCell><strong>Frequency</strong></TableCell>
                  <TableCell><strong>Duration</strong></TableCell>
                  <TableCell><strong>Qty</strong></TableCell>
                  <TableCell align="right"><strong>Price</strong></TableCell>
                  <TableCell align="center"><strong>Actions</strong></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {selectedMedications.map((med) => (
                  <TableRow key={med.drugId}>
                    <TableCell>
                      <Typography variant="body2" fontWeight="bold">
                        {med.drugName}
                      </Typography>
                      {med.genericName && (
                        <Typography variant="caption" color="text.secondary">
                          ({med.genericName})
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>{med.dosage}</TableCell>
                    <TableCell>{med.frequency}</TableCell>
                    <TableCell>{med.durationDays} days</TableCell>
                    <TableCell>{med.quantity}</TableCell>
                    <TableCell align="right">${parseFloat(med.totalPrice || 0).toFixed(2)}</TableCell>
                    <TableCell align="center">
                      <IconButton
                        size="small"
                        color="primary"
                        onClick={() => handleEditMedication(med)}
                      >
                        <EditIcon />
                      </IconButton>
                      <IconButton
                        size="small"
                        color="error"
                        onClick={() => handleRemoveMedication(med.drugId)}
                      >
                        <DeleteIcon />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow>
                  <TableCell colSpan={5} align="right">
                    <strong>Total Cost:</strong>
                  </TableCell>
                  <TableCell align="right">
                    <strong>${totalCost.toFixed(2)}</strong>
                  </TableCell>
                  <TableCell />
                </TableRow>
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}

      {/* Search and Filter */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} md={8}>
          <TextField
            fullWidth
            disabled={!canPrescribe}
            placeholder="Search medications by name or generic name..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon />
                </InputAdornment>
              ),
            }}
          />
        </Grid>
        <Grid item xs={12} md={4}>
          <FormControl fullWidth disabled={!canPrescribe}>
            <InputLabel>Category</InputLabel>
            <Select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              label="Category"
            >
              <MenuItem value="all">All Categories</MenuItem>
              {categories.map((catName) => (
                <MenuItem key={catName} value={catName}>
                  {catName}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Grid>
      </Grid>

      {/* Drug Catalog */}
      {loading ? (
        <Box display="flex" justifyContent="center" py={4}>
          <Typography>Loading drug catalog...</Typography>
        </Box>
      ) : filteredDrugs.length === 0 ? (
        <Alert severity="info">No medications found matching your criteria.</Alert>
      ) : (
        <Grid container spacing={2}>
          {filteredDrugs.slice(0, 12).map((drug) => {
            const isSelected = selectedMedications.find(m => m.drugId === drug.id);
            return (
              <Grid item xs={12} sm={6} md={4} key={drug.id}>
                <Card 
                  variant="outlined"
                  sx={{ 
                    height: '100%',
                    border: isSelected ? 2 : 1,
                    borderColor: isSelected ? 'secondary.main' : 'divider',
                    bgcolor: isSelected ? 'secondary.light' : 'background.paper',
                  }}
                >
                  <CardContent>
                    <Box display="flex" alignItems="center" gap={1} mb={1}>
                      <MedicationIcon color={isSelected ? 'secondary' : 'primary'} />
                      <Typography variant="subtitle1" fontWeight="bold">
                        {drug.brand_name || drug.generic_name}
                      </Typography>
                    </Box>
                    {drug.generic_name && (
                      <Typography variant="body2" color="text.secondary" gutterBottom>
                        Generic: {drug.generic_name}
                      </Typography>
                    )}
                    {drug.strength && (
                      <Chip label={drug.strength} size="small" sx={{ mb: 1 }} />
                    )}
                    {drug.category_name && (
                      <Typography variant="body2" color="text.secondary" gutterBottom>
                        Category: {drug.category_name}
                      </Typography>
                    )}
                    <Typography variant="body2" fontWeight="bold" color="primary">
                      ${parseFloat(drug.unit_price || 0).toFixed(2)} per unit
                    </Typography>
                  </CardContent>
                  <CardActions>
                    <Button
                      fullWidth
                      variant={isSelected ? 'outlined' : 'contained'}
                      color={isSelected ? 'secondary' : 'primary'}
                      startIcon={isSelected ? <DeleteIcon /> : <AddIcon />}
                      onClick={() => isSelected ? handleRemoveMedication(drug.id) : handleAddMedication(drug)}
                      disabled={isSelected || !canPrescribe}
                    >
                      {isSelected ? 'Added' : 'Prescribe'}
                    </Button>
                  </CardActions>
                </Card>
              </Grid>
            );
          })}
        </Grid>
      )}

      {selectedMedications.length === 0 && (
        <Box sx={{ mt: 3 }}>
          <Alert severity="info">
            No medications selected. If patient doesn't need medications, you can skip this section.
          </Alert>
        </Box>
      )}

      {/* Edit Medication Dialog */}
      <Dialog open={editDialogOpen} onClose={() => setEditDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Prescription Details</DialogTitle>
        <DialogContent>
          {editingMedication && (
            <Grid container spacing={2} sx={{ mt: 1 }}>
              {editError && (
                <Grid item xs={12}>
                  <Alert severity="error">{editError}</Alert>
                </Grid>
              )}
              <Grid item xs={12}>
                <Typography variant="subtitle1" fontWeight="bold">
                  {editingMedication.drugName}
                </Typography>
                {editingMedication.genericName && (
                  <Typography variant="body2" color="text.secondary">
                    ({editingMedication.genericName})
                  </Typography>
                )}
              </Grid>

              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Dosage"
                  value={editingMedication.dosage}
                  onChange={(e) => setEditingMedication({ ...editingMedication, dosage: e.target.value })}
                  placeholder="500mg"
                />
              </Grid>

              <Grid item xs={12} sm={6}>
                <FormControl fullWidth>
                  <InputLabel>Frequency</InputLabel>
                  <Select
                    value={editingMedication.frequency}
                    onChange={(e) => setEditingMedication({ ...editingMedication, frequency: e.target.value })}
                    label="Frequency"
                  >
                    <MenuItem value="OD">Once Daily (OD)</MenuItem>
                    <MenuItem value="BD">Twice Daily (BD)</MenuItem>
                    <MenuItem value="TID">Three Times Daily (TID)</MenuItem>
                    <MenuItem value="QID">Four Times Daily (QID)</MenuItem>
                    <MenuItem value="PRN">As Needed (PRN)</MenuItem>
                    <MenuItem value="STAT">Immediately (STAT)</MenuItem>
                  </Select>
                </FormControl>
              </Grid>

              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  required
                  type="number"
                  label="Duration (days)"
                  value={editingMedication.durationDays}
                  onChange={(e) => setEditingMedication({
                    ...editingMedication,
                    durationDays: parseInt(e.target.value, 10) || 0,
                  })}
                  inputProps={{ min: 1, max: 365, step: 1 }}
                  helperText="Enter a whole number from 1 to 365"
                />
              </Grid>

              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Quantity"
                  type="number"
                  value={editingMedication.quantity}
                  onChange={(e) => {
                    const quantity = parseInt(e.target.value) || 0;
                    setEditingMedication({ 
                      ...editingMedication, 
                      quantity,
                      totalPrice: quantity * editingMedication.unitPrice
                    });
                  }}
                  placeholder="21"
                />
              </Grid>

              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Instructions"
                  value={editingMedication.instructions}
                  onChange={(e) => setEditingMedication({ ...editingMedication, instructions: e.target.value })}
                  multiline
                  rows={2}
                  placeholder="Take with food, avoid alcohol..."
                />
              </Grid>

              <Grid item xs={12}>
                <Box sx={{ p: 2, bgcolor: 'info.light', borderRadius: 1 }}>
                  <Typography variant="body2">
                    <strong>Unit Price:</strong> ${parseFloat(editingMedication.unitPrice || 0).toFixed(2)}
                  </Typography>
                  <Typography variant="body2">
                    <strong>Quantity:</strong> {editingMedication.quantity}
                  </Typography>
                  <Typography variant="h6" color="primary">
                    <strong>Total:</strong> ${(editingMedication.quantity * editingMedication.unitPrice).toFixed(2)}
                  </Typography>
                </Box>
              </Grid>
            </Grid>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleSaveEdit} variant="contained" color="primary">
            Save
          </Button>
        </DialogActions>
      </Dialog>

    </Box>
  );
};

export default MedicationsSelector;
