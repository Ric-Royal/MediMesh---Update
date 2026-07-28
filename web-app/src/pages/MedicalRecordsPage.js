import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Box,
  Typography,
  Button,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  Chip,
  IconButton,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Grid,
  Card,
  CardContent,
  Alert,
  Menu,
  MenuList,
  MenuItem as MenuItemComponent,
  ListItemIcon,
  ListItemText,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions
} from '@mui/material';
import {
  Add as AddIcon,
  Search as SearchIcon,
  Visibility as ViewIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Download as DownloadIcon,
  MoreVert as MoreVertIcon,
  Clear as ClearIcon
} from '@mui/icons-material';
import { useNavigate } from '../routerCompat';
import apiService from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import LoadingSpinner from '../components/common/LoadingSpinner';
import { debounce } from 'lodash';

const MedicalRecordsPage = () => {
  const navigate = useNavigate();
  const { hasRole } = useAuth();
  
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filters, setFilters] = useState({
    record_type: '',
    provider_name: '',
    date_from: '',
    date_to: ''
  });
  const [pagination, setPagination] = useState({
    page: 0,
    limit: 25,
    total: 0
  });
  const [stats, setStats] = useState(null);
  const [menuAnchor, setMenuAnchor] = useState(null);
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Record types for filtering
  const recordTypes = [
    'consultation',
    'diagnosis', 
    'treatment',
    'lab_result',
    'imaging',
    'prescription',
    'vaccination',
    'surgery',
    'emergency',
    'discharge',
    'referral',
    'other'
  ];

  const fetchRecords = useCallback(async (search = '', currentFilters = {}, page = 0, limit = 25) => {
    try {
      setLoading(true);
      setError(null);

      const params = {
        search,
        page: page + 1, // API uses 1-based pagination
        limit,
        ...currentFilters
      };

      // Remove empty filters
      Object.keys(params).forEach(key => {
        if (params[key] === '' || params[key] === null || params[key] === undefined) {
          delete params[key];
        }
      });

      const response = await apiService.medicalRecords.getAll(params);
      
      setRecords(response.data || []);
      setPagination(prev => ({
        ...prev,
        total: response.total || 0
      }));
    } catch (err) {
      console.error('Error fetching medical records:', err);
      setError('Failed to load medical records. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchStats = useCallback(async () => {
    try {
      const response = await apiService.medicalRecords.getStatistics();
      setStats(response.data);
    } catch (err) {
      console.error('Error fetching stats:', err);
    }
  }, []);

  // Debounced search function
  const debouncedSearch = useMemo(
    () => debounce(fetchRecords, 300),
    [fetchRecords]
  );

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  useEffect(() => {
    debouncedSearch(searchTerm, filters, pagination.page, pagination.limit);
    return () => debouncedSearch.cancel();
  }, [searchTerm, filters, pagination.page, pagination.limit, debouncedSearch]);

  const handleSearch = (event) => {
    setSearchTerm(event.target.value);
    setPagination(prev => ({ ...prev, page: 0 }));
  };

  const handleFilterChange = (field, value) => {
    setFilters(prev => ({
      ...prev,
      [field]: value
    }));
    setPagination(prev => ({ ...prev, page: 0 }));
  };

  const handleClearFilters = () => {
    setFilters({
      record_type: '',
      provider_name: '',
      date_from: '',
      date_to: ''
    });
    setSearchTerm('');
    setPagination(prev => ({ ...prev, page: 0 }));
  };

  const handlePageChange = (event, newPage) => {
    setPagination(prev => ({
      ...prev,
      page: newPage
    }));
  };

  const handleRowsPerPageChange = (event) => {
    const newLimit = parseInt(event.target.value, 10);
    setPagination(prev => ({
      ...prev,
      limit: newLimit,
      page: 0
    }));
  };

  const handleMenuOpen = (event, record) => {
    setMenuAnchor(event.currentTarget);
    setSelectedRecord(record);
  };

  const handleMenuClose = () => {
    setMenuAnchor(null);
    setSelectedRecord(null);
  };

  const handleDeleteRecord = async () => {
    if (!selectedRecord) return;

    try {
      setDeleting(true);
      await apiService.medicalRecords.delete(selectedRecord.id);
      
      // Refresh the list
      fetchRecords(searchTerm, filters, pagination.page, pagination.limit);
      fetchStats();
      
      setDeleteDialogOpen(false);
      handleMenuClose();
    } catch (err) {
      console.error('Error deleting record:', err);
      setError('Failed to delete record. Please try again.');
    } finally {
      setDeleting(false);
    }
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const getRecordTypeColor = (type) => {
    const colors = {
      'consultation': 'primary',
      'diagnosis': 'secondary',
      'treatment': 'success',
      'lab_result': 'info',
      'imaging': 'warning',
      'prescription': 'error',
      'vaccination': 'success',
      'surgery': 'secondary',
      'emergency': 'error',
      'discharge': 'info',
      'referral': 'warning',
      'other': 'default'
    };
    return colors[type] || 'default';
  };

  const handleExport = async () => {
    try {
      const params = {
        search: searchTerm,
        ...filters,
        format: 'csv'
      };

      // Remove empty filters
      Object.keys(params).forEach(key => {
        if (params[key] === '' || params[key] === null || params[key] === undefined) {
          delete params[key];
        }
      });

      await apiService.medicalRecords.export(params);
      handleMenuClose();
    } catch (err) {
      console.error('Error exporting records:', err);
      setError('Failed to export records. Please try again.');
    }
  };

  if (loading && records.length === 0) {
    return <LoadingSpinner message="Loading medical records..." />;
  }

  return (
    <Box sx={{ width: '100%', minWidth: 0 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4">
          Medical Records
        </Typography>
        
        {(hasRole('doctor') || hasRole('nurse') || hasRole('admin')) && (
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => navigate('/records/new')}
          >
            New Record
          </Button>
        )}
      </Box>

      {/* Stats Cards */}
      {stats && (
        <Grid container spacing={3} sx={{ mb: 3 }}>
          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Typography color="textSecondary" gutterBottom>
                  Total Records
                </Typography>
                <Typography variant="h4">
                  {stats.total_records || 0}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Typography color="textSecondary" gutterBottom>
                  This Month
                </Typography>
                <Typography variant="h4">
                  {stats.new_records_30d || 0}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Typography color="textSecondary" gutterBottom>
                  Record Types
                </Typography>
                <Typography variant="h4">
                  {stats.record_types_count || 0}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Typography color="textSecondary" gutterBottom>
                  Active Patients
                </Typography>
                <Typography variant="h4">
                  {stats.unique_patients || 0}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {/* Search and Filters */}
      <Paper sx={{ p: 2, mb: 2 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} md={4}>
            <TextField
              fullWidth
              placeholder="Search records..."
              value={searchTerm}
              onChange={handleSearch}
              InputProps={{
                startAdornment: <SearchIcon sx={{ mr: 1, color: 'action.active' }} />
              }}
            />
          </Grid>
          
          <Grid item xs={12} md={2}>
            <FormControl fullWidth>
              <InputLabel>Record Type</InputLabel>
              <Select
                value={filters.record_type}
                label="Record Type"
                onChange={(e) => handleFilterChange('record_type', e.target.value)}
              >
                <MenuItem value="">All Types</MenuItem>
                {recordTypes.map(type => (
                  <MenuItem key={type} value={type}>
                    {type.replace('_', ' ').toUpperCase()}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>

          <Grid item xs={12} md={2}>
            <TextField
              fullWidth
              label="Provider"
              value={filters.provider_name}
              onChange={(e) => handleFilterChange('provider_name', e.target.value)}
            />
          </Grid>

          <Grid item xs={12} md={2}>
            <TextField
              fullWidth
              label="From Date"
              type="date"
              value={filters.date_from}
              onChange={(e) => handleFilterChange('date_from', e.target.value)}
              InputLabelProps={{ shrink: true }}
            />
          </Grid>

          <Grid item xs={12} md={2}>
            <TextField
              fullWidth
              label="To Date"
              type="date"
              value={filters.date_to}
              onChange={(e) => handleFilterChange('date_to', e.target.value)}
              InputLabelProps={{ shrink: true }}
            />
          </Grid>

          <Grid item xs={12} md={12}>
            <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
              <Button
                startIcon={<ClearIcon />}
                onClick={handleClearFilters}
                variant="outlined"
              >
                Clear Filters
              </Button>
              <Button
                startIcon={<DownloadIcon />}
                onClick={handleExport}
                variant="outlined"
              >
                Export
              </Button>
            </Box>
          </Grid>
        </Grid>
      </Paper>

      {/* Error Alert */}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Records Table */}
      <Paper sx={{ width: '100%', minWidth: 0 }}>
        <TableContainer>
          <Table sx={{ width: '100%' }}>
            <TableHead>
              <TableRow>
                <TableCell>Date</TableCell>
                <TableCell>Patient</TableCell>
                <TableCell>Type</TableCell>
                <TableCell>Provider</TableCell>
                <TableCell>Notes</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} align="center">
                    <LoadingSpinner size={40} />
                  </TableCell>
                </TableRow>
              ) : records.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} align="center">
                    <Typography color="text.secondary" sx={{ py: 4 }}>
                      No medical records found.
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                records.map((record) => (
                  <TableRow 
                    key={record.id} 
                    hover
                    sx={{ cursor: 'pointer' }}
                    onClick={() => navigate(`/records/${record.id}`)}
                  >
                    <TableCell>
                      <Typography variant="body2">
                        {formatDate(record.record_date)}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography 
                        variant="body2" 
                        sx={{ 
                          fontWeight: 'medium',
                          cursor: 'pointer',
                          '&:hover': { color: 'primary.main' }
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/patients/${record.patient_id}`);
                        }}
                      >
                        {record.patient_name}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" display="block">
                        ID: {record.patient_id}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={record.record_type.replace('_', ' ').toUpperCase()}
                        size="small"
                        color={getRecordTypeColor(record.record_type)}
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">
                        {record.provider_name}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography 
                        variant="body2" 
                        sx={{
                          width: '100%',
                          minWidth: 180,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        {record.notes || 'No notes'}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <IconButton
                        onClick={(e) => {
                          e.stopPropagation();
                          handleMenuOpen(e, record);
                        }}
                        size="small"
                      >
                        <MoreVertIcon />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>

        {/* Pagination */}
        <TablePagination
          component="div"
          count={pagination.total}
          page={pagination.page}
          onPageChange={handlePageChange}
          rowsPerPage={pagination.limit}
          onRowsPerPageChange={handleRowsPerPageChange}
          rowsPerPageOptions={[10, 25, 50, 100]}
        />
      </Paper>

      {/* Action Menu */}
      <Menu
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={handleMenuClose}
        onClick={handleMenuClose}
      >
        <MenuList>
          <MenuItemComponent onClick={() => navigate(`/records/${selectedRecord?.id}`)}>
            <ListItemIcon>
              <ViewIcon />
            </ListItemIcon>
            <ListItemText>View Details</ListItemText>
          </MenuItemComponent>
          
          {(hasRole('doctor') || hasRole('nurse') || hasRole('admin')) && (
            <MenuItemComponent onClick={() => navigate(`/records/${selectedRecord?.id}/edit`)}>
              <ListItemIcon>
                <EditIcon />
              </ListItemIcon>
              <ListItemText>Edit Record</ListItemText>
            </MenuItemComponent>
          )}
          
          <MenuItemComponent onClick={() => navigate(`/patients/${selectedRecord?.patient_id}`)}>
            <ListItemIcon>
              <ViewIcon />
            </ListItemIcon>
            <ListItemText>View Patient</ListItemText>
          </MenuItemComponent>

          {(hasRole('doctor') || hasRole('admin')) && (
            <MenuItemComponent 
              onClick={() => setDeleteDialogOpen(true)}
              sx={{ color: 'error.main' }}
            >
              <ListItemIcon>
                <DeleteIcon color="error" />
              </ListItemIcon>
              <ListItemText>Delete Record</ListItemText>
            </MenuItemComponent>
          )}
        </MenuList>
      </Menu>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle>Delete Medical Record</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete this medical record? This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
          <Button 
            onClick={handleDeleteRecord} 
            color="error" 
            variant="contained"
            disabled={deleting}
          >
            {deleting ? 'Deleting...' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default MedicalRecordsPage;
