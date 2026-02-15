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
} from '@mui/material';
import {
  Search as SearchIcon,
  Add as AddIcon,
  Delete as DeleteIcon,
  CameraAlt as ImagingIcon,
} from '@mui/icons-material';
import API_CONFIG from '../../config/api';

const RadiologyStudiesSelector = ({ selectedStudies, onChange }) => {
  const [studyCatalog, setStudyCatalog] = useState([]);
  const [filteredStudies, setFilteredStudies] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [modalityFilter, setModalityFilter] = useState('all');
  const [loading, setLoading] = useState(true);

  // Fetch radiology study catalog
  useEffect(() => {
    const fetchStudyCatalog = async () => {
      try {
        const response = await fetch(`${API_CONFIG.baseURL}/api/radiology/study-catalog`, {
          headers: API_CONFIG.getAuthHeaders(),
        });

        if (response.ok) {
          const data = await response.json();
          setStudyCatalog(data.data || []);
          setFilteredStudies(data.data || []);
        } else {
          console.error('Failed to fetch study catalog');
        }
      } catch (error) {
        console.error('Error fetching study catalog:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchStudyCatalog();
  }, []);

  // Filter studies based on search and modality
  useEffect(() => {
    let filtered = studyCatalog;

    if (searchTerm) {
      filtered = filtered.filter(study =>
        study.study_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        study.study_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
        study.body_part.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    if (modalityFilter !== 'all') {
      filtered = filtered.filter(study => study.modality === modalityFilter);
    }

    setFilteredStudies(filtered);
  }, [searchTerm, modalityFilter, studyCatalog]);

  const modalities = [...new Set(studyCatalog.map(study => study.modality))];

  const handleAddStudy = (study) => {
    // Check if already added
    if (selectedStudies.find(s => s.studyId === study.id)) {
      return;
    }

    const newStudy = {
      studyId: study.id,
      studyName: study.study_name,
      studyCode: study.study_code,
      modality: study.modality,
      bodyPart: study.body_part,
      contrastRequired: study.contrast_required,
      price: study.price,
      priority: 'routine',
      reason: '',
    };

    onChange([...selectedStudies, newStudy]);
  };

  const handleRemoveStudy = (studyId) => {
    onChange(selectedStudies.filter(study => study.studyId !== studyId));
  };

  const handlePriorityChange = (studyId, priority) => {
    onChange(
      selectedStudies.map(study =>
        study.studyId === studyId ? { ...study, priority } : study
      )
    );
  };

  const handleReasonChange = (studyId, reason) => {
    onChange(
      selectedStudies.map(study =>
        study.studyId === studyId ? { ...study, reason } : study
      )
    );
  };

  const totalCost = selectedStudies.reduce((sum, study) => sum + (study.price || 0), 0);

  return (
    <Box>
      <Typography variant="h6" gutterBottom>
        Radiology & Imaging Studies
      </Typography>

      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Select the imaging studies you want to order for this patient. You can order multiple studies at once.
      </Typography>

      {/* Selected Studies Summary */}
      {selectedStudies.length > 0 && (
        <Paper elevation={2} sx={{ p: 2, mb: 3, bgcolor: 'info.light' }}>
          <Typography variant="subtitle2" gutterBottom>
            Selected Studies ({selectedStudies.length})
          </Typography>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell><strong>Study Name</strong></TableCell>
                  <TableCell><strong>Modality</strong></TableCell>
                  <TableCell><strong>Body Part</strong></TableCell>
                  <TableCell><strong>Priority</strong></TableCell>
                  <TableCell><strong>Reason</strong></TableCell>
                  <TableCell align="right"><strong>Price</strong></TableCell>
                  <TableCell align="center"><strong>Actions</strong></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {selectedStudies.map((study) => (
                  <TableRow key={study.studyId}>
                    <TableCell>
                      {study.studyName}
                      {study.contrastRequired && (
                        <Chip label="Contrast" size="small" color="warning" sx={{ ml: 1 }} />
                      )}
                    </TableCell>
                    <TableCell>
                      <Chip label={study.modality} size="small" />
                    </TableCell>
                    <TableCell>{study.bodyPart}</TableCell>
                    <TableCell>
                      <Select
                        size="small"
                        value={study.priority}
                        onChange={(e) => handlePriorityChange(study.studyId, e.target.value)}
                      >
                        <MenuItem value="routine">Routine</MenuItem>
                        <MenuItem value="urgent">Urgent</MenuItem>
                        <MenuItem value="stat">STAT</MenuItem>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <TextField
                        size="small"
                        placeholder="Reason for study..."
                        value={study.reason}
                        onChange={(e) => handleReasonChange(study.studyId, e.target.value)}
                        fullWidth
                      />
                    </TableCell>
                    <TableCell align="right">${study.price?.toFixed(2)}</TableCell>
                    <TableCell align="center">
                      <IconButton
                        size="small"
                        color="error"
                        onClick={() => handleRemoveStudy(study.studyId)}
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
            placeholder="Search studies by name, code, or body part..."
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
            <InputLabel>Modality</InputLabel>
            <Select
              value={modalityFilter}
              onChange={(e) => setModalityFilter(e.target.value)}
              label="Modality"
            >
              <MenuItem value="all">All Modalities</MenuItem>
              {modalities.map((modality) => (
                <MenuItem key={modality} value={modality}>
                  {modality}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Grid>
      </Grid>

      {/* Study Catalog */}
      {loading ? (
        <Box display="flex" justifyContent="center" py={4}>
          <Typography>Loading study catalog...</Typography>
        </Box>
      ) : filteredStudies.length === 0 ? (
        <Alert severity="info">No studies found matching your criteria.</Alert>
      ) : (
        <Grid container spacing={2}>
          {filteredStudies.map((study) => {
            const isSelected = selectedStudies.find(s => s.studyId === study.id);
            return (
              <Grid item xs={12} sm={6} md={4} key={study.id}>
                <Card 
                  variant="outlined"
                  sx={{ 
                    height: '100%',
                    border: isSelected ? 2 : 1,
                    borderColor: isSelected ? 'info.main' : 'divider',
                    bgcolor: isSelected ? 'info.light' : 'background.paper',
                  }}
                >
                  <CardContent>
                    <Box display="flex" alignItems="center" gap={1} mb={1}>
                      <ImagingIcon color={isSelected ? 'info' : 'primary'} />
                      <Typography variant="subtitle1" fontWeight="bold">
                        {study.study_name}
                      </Typography>
                    </Box>
                    <Chip 
                      label={study.study_code} 
                      size="small" 
                      sx={{ mb: 1 }}
                      color={isSelected ? 'info' : 'default'}
                    />
                    <Typography variant="body2" color="text.secondary" gutterBottom>
                      Modality: {study.modality}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" gutterBottom>
                      Body Part: {study.body_part}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" gutterBottom>
                      Duration: {study.typical_duration} min
                    </Typography>
                    {study.contrast_required && (
                      <Chip label="Contrast Required" size="small" color="warning" sx={{ mb: 1 }} />
                    )}
                    <Typography variant="body2" fontWeight="bold" color="primary">
                      ${study.price?.toFixed(2)}
                    </Typography>
                  </CardContent>
                  <CardActions>
                    <Button
                      fullWidth
                      variant={isSelected ? 'outlined' : 'contained'}
                      color={isSelected ? 'info' : 'primary'}
                      startIcon={isSelected ? <DeleteIcon /> : <AddIcon />}
                      onClick={() => isSelected ? handleRemoveStudy(study.id) : handleAddStudy(study)}
                      disabled={isSelected}
                    >
                      {isSelected ? 'Added' : 'Add Study'}
                    </Button>
                  </CardActions>
                </Card>
              </Grid>
            );
          })}
        </Grid>
      )}

      {selectedStudies.length === 0 && (
        <Box sx={{ mt: 3 }}>
          <Alert severity="info">
            No imaging studies selected. If patient doesn't need imaging, you can skip this section.
          </Alert>
        </Box>
      )}
    </Box>
  );
};

export default RadiologyStudiesSelector;

