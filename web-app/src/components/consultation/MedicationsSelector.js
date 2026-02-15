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

const MedicationsSelector = ({ selectedMedications, onChange }) => {
  const [drugCatalog, setDrugCatalog] = useState([]);
  const [filteredDrugs, setFilteredDrugs] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingMedication, setEditingMedication] = useState(null);

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
      filtered = filtered.filter(drug =>
        drug.drug_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        drug.drug_code?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        drug.generic_name?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    if (categoryFilter !== 'all') {
      filtered = filtered.filter(drug => drug.category === categoryFilter);
    }

    setFilteredDrugs(filtered);
  }, [searchTerm, categoryFilter, drugCatalog]);

  const categories = [...new Set(drugCatalog.map(drug => drug.category).filter(Boolean))];

  const handleAddMedication = (drug) => {
    // Check if already added
    if (selectedMedications.find(m => m.drugId === drug.id)) {
      return;
    }

    const newMedication = {
      drugId: drug.id,
      drugName: drug.drug_name,
      drugCode: drug.drug_code,
      genericName: drug.generic_name,
      dosage: drug.strength || '',
      frequency: 'TID',
      duration: '7 days',
      quantity: 21,
      instructions: 'Take with food',
      unitPrice: drug.unit_price || 0,
      totalPrice: 0,
    };

    // Calculate total price
    newMedication.totalPrice = newMedication.quantity * newMedication.unitPrice;

    setEditingMedication(newMedication);
    setEditDialogOpen(true);
  };

  const handleSaveEdit = () => {
    if (editingMedication) {
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
  };

  const handleRemoveMedication = (drugId) => {
    onChange(selectedMedications.filter(med => med.drugId !== drugId));
  };

  const handleEditMedication = (medication) => {
    setEditingMedication({ ...medication });
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
                    <TableCell>{med.duration}</TableCell>
                    <TableCell>{med.quantity}</TableCell>
                    <TableCell align="right">${med.totalPrice?.toFixed(2)}</TableCell>
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
          <FormControl fullWidth>
            <InputLabel>Category</InputLabel>
            <Select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              label="Category"
            >
              <MenuItem value="all">All Categories</MenuItem>
              {categories.map((category) => (
                <MenuItem key={category} value={category}>
                  {category}
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
                        {drug.drug_name}
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
                    {drug.category && (
                      <Typography variant="body2" color="text.secondary" gutterBottom>
                        Category: {drug.category}
                      </Typography>
                    )}
                    <Typography variant="body2" fontWeight="bold" color="primary">
                      ${drug.unit_price?.toFixed(2)} per unit
                    </Typography>
                  </CardContent>
                  <CardActions>
                    <Button
                      fullWidth
                      variant={isSelected ? 'outlined' : 'contained'}
                      color={isSelected ? 'secondary' : 'primary'}
                      startIcon={isSelected ? <DeleteIcon /> : <AddIcon />}
                      onClick={() => isSelected ? handleRemoveMedication(drug.id) : handleAddMedication(drug)}
                      disabled={isSelected}
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
                  label="Duration"
                  value={editingMedication.duration}
                  onChange={(e) => setEditingMedication({ ...editingMedication, duration: e.target.value })}
                  placeholder="7 days"
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
                    <strong>Unit Price:</strong> ${editingMedication.unitPrice?.toFixed(2)}
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

      {/* Drug Catalog Grid */}
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
                        {drug.drug_name}
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
                    {drug.category && (
                      <Typography variant="body2" color="text.secondary" gutterBottom>
                        Category: {drug.category}
                      </Typography>
                    )}
                    <Typography variant="body2" fontWeight="bold" color="primary">
                      ${drug.unit_price?.toFixed(2)} per unit
                    </Typography>
                    {drug.stock_quantity !== undefined && (
                      <Typography variant="caption" color={drug.stock_quantity > 0 ? 'success.main' : 'error.main'}>
                        Stock: {drug.stock_quantity}
                      </Typography>
                    )}
                  </CardContent>
                  <CardActions>
                    <Button
                      fullWidth
                      variant={isSelected ? 'outlined' : 'contained'}
                      color={isSelected ? 'secondary' : 'primary'}
                      startIcon={isSelected ? <EditIcon /> : <AddIcon />}
                      onClick={() => isSelected ? handleEditMedication(isSelected) : handleAddMedication(drug)}
                    >
                      {isSelected ? 'Edit' : 'Prescribe'}
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
    </Box>
  );
};

export default MedicationsSelector;


