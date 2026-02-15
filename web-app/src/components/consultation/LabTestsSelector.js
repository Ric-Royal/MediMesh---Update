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
  Science as ScienceIcon,
} from '@mui/icons-material';
import API_CONFIG from '../../config/api';

const LabTestsSelector = ({ selectedTests, onChange }) => {
  const [testCatalog, setTestCatalog] = useState([]);
  const [filteredTests, setFilteredTests] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [loading, setLoading] = useState(true);

  // Fetch lab test catalog
  useEffect(() => {
    const fetchTestCatalog = async () => {
      try {
        const response = await fetch(`${API_CONFIG.baseURL}/api/lab/test-catalog`, {
          headers: API_CONFIG.getAuthHeaders(),
        });

        if (response.ok) {
          const data = await response.json();
          setTestCatalog(data.data || []);
          setFilteredTests(data.data || []);
        } else {
          console.error('Failed to fetch test catalog');
        }
      } catch (error) {
        console.error('Error fetching test catalog:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchTestCatalog();
  }, []);

  // Filter tests based on search and category
  useEffect(() => {
    let filtered = testCatalog;

    if (searchTerm) {
      filtered = filtered.filter(test =>
        test.test_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        test.test_code.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    if (categoryFilter !== 'all') {
      filtered = filtered.filter(test => test.test_category === categoryFilter);
    }

    setFilteredTests(filtered);
  }, [searchTerm, categoryFilter, testCatalog]);

  const categories = [...new Set(testCatalog.map(test => test.test_category))];

  const handleAddTest = (test) => {
    // Check if already added
    if (selectedTests.find(t => t.testId === test.id)) {
      return;
    }

    const newTest = {
      testId: test.id,
      testName: test.test_name,
      testCode: test.test_code,
      category: test.test_category,
      sampleType: test.sample_type,
      price: test.price,
      priority: 'routine',
      clinicalNotes: '',
    };

    onChange([...selectedTests, newTest]);
  };

  const handleRemoveTest = (testId) => {
    onChange(selectedTests.filter(test => test.testId !== testId));
  };

  const handlePriorityChange = (testId, priority) => {
    onChange(
      selectedTests.map(test =>
        test.testId === testId ? { ...test, priority } : test
      )
    );
  };

  const totalCost = selectedTests.reduce((sum, test) => sum + (test.price || 0), 0);

  return (
    <Box>
      <Typography variant="h6" gutterBottom>
        Laboratory Tests
      </Typography>

      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Select the lab tests you want to order for this patient. You can order multiple tests at once.
      </Typography>

      {/* Selected Tests Summary */}
      {selectedTests.length > 0 && (
        <Paper elevation={2} sx={{ p: 2, mb: 3, bgcolor: 'success.light' }}>
          <Typography variant="subtitle2" gutterBottom>
            Selected Tests ({selectedTests.length})
          </Typography>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell><strong>Test Name</strong></TableCell>
                  <TableCell><strong>Code</strong></TableCell>
                  <TableCell><strong>Sample</strong></TableCell>
                  <TableCell><strong>Priority</strong></TableCell>
                  <TableCell align="right"><strong>Price</strong></TableCell>
                  <TableCell align="center"><strong>Actions</strong></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {selectedTests.map((test) => (
                  <TableRow key={test.testId}>
                    <TableCell>{test.testName}</TableCell>
                    <TableCell>
                      <Chip label={test.testCode} size="small" />
                    </TableCell>
                    <TableCell>{test.sampleType}</TableCell>
                    <TableCell>
                      <Select
                        size="small"
                        value={test.priority}
                        onChange={(e) => handlePriorityChange(test.testId, e.target.value)}
                      >
                        <MenuItem value="routine">Routine</MenuItem>
                        <MenuItem value="urgent">Urgent</MenuItem>
                        <MenuItem value="stat">STAT</MenuItem>
                      </Select>
                    </TableCell>
                    <TableCell align="right">${test.price?.toFixed(2)}</TableCell>
                    <TableCell align="center">
                      <IconButton
                        size="small"
                        color="error"
                        onClick={() => handleRemoveTest(test.testId)}
                      >
                        <DeleteIcon />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow>
                  <TableCell colSpan={4} align="right">
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
            placeholder="Search tests by name or code..."
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

      {/* Test Catalog */}
      {loading ? (
        <Box display="flex" justifyContent="center" py={4}>
          <Typography>Loading test catalog...</Typography>
        </Box>
      ) : filteredTests.length === 0 ? (
        <Alert severity="info">No tests found matching your criteria.</Alert>
      ) : (
        <Grid container spacing={2}>
          {filteredTests.map((test) => {
            const isSelected = selectedTests.find(t => t.testId === test.id);
            return (
              <Grid item xs={12} sm={6} md={4} key={test.id}>
                <Card 
                  variant="outlined"
                  sx={{ 
                    height: '100%',
                    border: isSelected ? 2 : 1,
                    borderColor: isSelected ? 'success.main' : 'divider',
                    bgcolor: isSelected ? 'success.light' : 'background.paper',
                  }}
                >
                  <CardContent>
                    <Box display="flex" alignItems="center" gap={1} mb={1}>
                      <ScienceIcon color={isSelected ? 'success' : 'primary'} />
                      <Typography variant="subtitle1" fontWeight="bold">
                        {test.test_name}
                      </Typography>
                    </Box>
                    <Chip 
                      label={test.test_code} 
                      size="small" 
                      sx={{ mb: 1 }}
                      color={isSelected ? 'success' : 'default'}
                    />
                    <Typography variant="body2" color="text.secondary" gutterBottom>
                      Category: {test.test_category}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" gutterBottom>
                      Sample: {test.sample_type}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" gutterBottom>
                      Turnaround: {test.turnaround_time} min
                    </Typography>
                    <Typography variant="body2" fontWeight="bold" color="primary">
                      ${test.price?.toFixed(2)}
                    </Typography>
                  </CardContent>
                  <CardActions>
                    <Button
                      fullWidth
                      variant={isSelected ? 'outlined' : 'contained'}
                      color={isSelected ? 'success' : 'primary'}
                      startIcon={isSelected ? <DeleteIcon /> : <AddIcon />}
                      onClick={() => isSelected ? handleRemoveTest(test.id) : handleAddTest(test)}
                      disabled={isSelected}
                    >
                      {isSelected ? 'Added' : 'Add Test'}
                    </Button>
                  </CardActions>
                </Card>
              </Grid>
            );
          })}
        </Grid>
      )}

      {selectedTests.length === 0 && (
        <Box sx={{ mt: 3 }}>
          <Alert severity="info">
            No lab tests selected. If patient doesn't need lab work, you can skip this section.
          </Alert>
        </Box>
      )}
    </Box>
  );
};

export default LabTestsSelector;

