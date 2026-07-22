import React, { useState, useEffect, useCallback } from 'react';
import {
  Paper, Typography, Box, Tab, Tabs, Grid, Card, CardContent,
  Button, Chip, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField,
  IconButton, Alert, CircularProgress, Divider
} from '@mui/material';
import {
  Science as ScienceIcon,
  CheckCircle as CheckCircleIcon,
  Pending as PendingIcon,
  LocalHospital as LocalHospitalIcon,
  Print as PrintIcon,
  Visibility as VisibilityIcon
} from '@mui/icons-material';
import API_CONFIG from '../config/api';
import { useNotification } from '../contexts/NotificationContext';

const LaboratoryPage = () => {
  const { notifySuccess, notifyError } = useNotification();
  const [activeTab, setActiveTab] = useState(0);
  const [loading, setLoading] = useState(false);
  const [orders, setOrders] = useState([]);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [resultsDialogOpen, setResultsDialogOpen] = useState(false);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [results, setResults] = useState({});
  const [statistics, setStatistics] = useState({});

  // Fetch lab orders
  const fetchOrders = useCallback(async (status = 'pending') => {
    setLoading(true);
    try {
      const response = await fetch(`${API_CONFIG.endpoints.lab.orders}?status=${status}`, {
        headers: API_CONFIG.getAuthHeaders(),
      });
      if (response.ok) {
        const data = await response.json();
        setOrders(data.data || []);
      } else {
        notifyError('Failed to fetch lab orders');
      }
    } catch (error) {
      console.error('Error fetching lab orders:', error);
      notifyError('An error occurred while fetching lab orders');
    } finally {
      setLoading(false);
    }
  }, [notifyError]);

  useEffect(() => {
    const statusMap = ['pending', 'in-progress', 'completed'];
    fetchOrders(statusMap[activeTab]);
    fetch(`${API_CONFIG.baseURL}/api/lab/statistics`, { headers: API_CONFIG.getAuthHeaders() })
      .then(response => response.ok ? response.json() : null)
      .then(data => data && setStatistics(data.data || {}))
      .catch(() => {});
  }, [activeTab, fetchOrders]);

  const handleTabChange = (event, newValue) => {
    setActiveTab(newValue);
  };

  const handleStartOrder = async (order) => {
    try {
      const response = await fetch(`${API_CONFIG.endpoints.lab.orders}/${order.id}/status`, {
        method: 'PUT',
        headers: API_CONFIG.getAuthHeaders(),
        body: JSON.stringify({ status: 'in-progress' }),
      });
      if (response.ok) {
        notifySuccess('Lab order started');
        setActiveTab(1);
      } else {
        notifyError('Failed to start lab order');
      }
    } catch (error) {
      console.error('Error starting lab order:', error);
      notifyError('An error occurred');
    }
  };

  const handleOpenResultsDialog = async (order) => {
    setSelectedOrder(order);
    
    // Fetch order items (tests)
    try {
      const response = await fetch(`${API_CONFIG.endpoints.lab.orders}/${order.id}`, {
        headers: API_CONFIG.getAuthHeaders(),
      });
      if (response.ok) {
        const data = await response.json();
        const orderDetails = data.data;
        
        // Initialize results object with test items
        const initialResults = {};
        if (orderDetails.items) {
          orderDetails.items.forEach(item => {
            initialResults[item.id] = {
              result: item.result_value || '',
              reference_range: [item.reference_min, item.reference_max].filter(Boolean).join(' – '),
              unit: item.result_unit || '',
              notes: item.result_notes || '',
            };
          });
        }
        setResults(initialResults);
        setSelectedOrder(orderDetails);
        setResultsDialogOpen(true);
      }
    } catch (error) {
      console.error('Error fetching order details:', error);
      notifyError('Failed to load order details');
    }
  };

  const handleResultChange = (itemId, field, value) => {
    setResults(prev => ({
      ...prev,
      [itemId]: {
        ...prev[itemId],
        [field]: value,
      },
    }));
  };

  const handleSubmitResults = async () => {
    if (!selectedOrder) return;

    try {
      // Update each test result
      for (const [itemId, resultData] of Object.entries(results)) {
        const resultResponse = await fetch(`${API_CONFIG.endpoints.lab.orders}/${selectedOrder.id}/items/${itemId}/result`, {
          method: 'POST',
          headers: API_CONFIG.getAuthHeaders(),
          body: JSON.stringify({
            result_value: resultData.result,
            reference_min: resultData.reference_range,
            reference_max: null,
            result_unit: resultData.unit,
            result_notes: resultData.notes,
          }),
        });
        if (!resultResponse.ok) {
          const error = await resultResponse.json();
          throw new Error(error.error || 'Failed to save a test result');
        }
      }

      notifySuccess('Lab results released. The visit, queue and invoice were updated.');
      setResultsDialogOpen(false);
      setSelectedOrder(null);
      setActiveTab(2);
    } catch (error) {
      console.error('Error submitting results:', error);
      notifyError('An error occurred while submitting results');
    }
  };

  const handleViewOrder = async (order) => {
    try {
      const response = await fetch(`${API_CONFIG.endpoints.lab.orders}/${order.id}`, {
        headers: API_CONFIG.getAuthHeaders(),
      });
      if (response.ok) {
        const data = await response.json();
        setSelectedOrder(data.data);
        setViewDialogOpen(true);
      }
    } catch (error) {
      console.error('Error fetching order details:', error);
      notifyError('Failed to load order details');
    }
  };

  const getStatusChip = (status) => {
    const statusConfig = {
      pending: { color: 'warning', icon: <PendingIcon fontSize="small" /> },
      'in-progress': { color: 'info', icon: <ScienceIcon fontSize="small" /> },
      completed: { color: 'success', icon: <CheckCircleIcon fontSize="small" /> },
    };
    const config = statusConfig[status] || statusConfig.pending;
    return (
      <Chip
        label={status.toUpperCase().replace('-', ' ')}
        color={config.color}
        size="small"
        icon={config.icon}
      />
    );
  };

  const getPriorityChip = (priority) => {
    const colors = {
      urgent: 'error',
      high: 'warning',
      routine: 'default',
    };
    return (
      <Chip
        label={priority?.toUpperCase() || 'ROUTINE'}
        color={colors[priority] || 'default'}
        size="small"
      />
    );
  };

  return (
    <Box component="section" sx={{ width: '100%', minWidth: 0, mb: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
        <LocalHospitalIcon sx={{ fontSize: 40, mr: 2, color: 'primary.main' }} />
        <Typography variant="h4" component="h1">
          Laboratory Management
        </Typography>
      </Box>

      {/* Summary Cards */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={4}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Box>
                  <Typography color="textSecondary" gutterBottom>
                    Pending Orders
                  </Typography>
                  <Typography variant="h4">
                    {statistics.pending_orders || 0}
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
                    In Progress
                  </Typography>
                  <Typography variant="h4">
                    {statistics.in_progress || 0}
                  </Typography>
                </Box>
                <ScienceIcon sx={{ fontSize: 48, color: 'info.main', opacity: 0.3 }} />
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
                    Completed Today
                  </Typography>
                  <Typography variant="h4">
                    {statistics.completed_today || 0}
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
          <Tab label="Pending Orders" icon={<PendingIcon />} iconPosition="start" />
          <Tab label="In Progress" icon={<ScienceIcon />} iconPosition="start" />
          <Tab label="Completed" icon={<CheckCircleIcon />} iconPosition="start" />
        </Tabs>
      </Paper>

      {/* Orders Table */}
      <Paper>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Order Number</TableCell>
                <TableCell>Patient</TableCell>
                <TableCell>UHID</TableCell>
                <TableCell>Tests</TableCell>
                <TableCell>Priority</TableCell>
                <TableCell>Ordered By</TableCell>
                <TableCell>Order Date</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={9} align="center">
                    <CircularProgress />
                  </TableCell>
                </TableRow>
              ) : orders.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} align="center">
                    <Typography color="textSecondary">No orders found</Typography>
                  </TableCell>
                </TableRow>
              ) : (
                orders.map((order) => (
                  <TableRow key={order.id} hover>
                    <TableCell>
                      <Typography variant="body2" fontWeight="bold">
                        {order.order_number}
                      </Typography>
                    </TableCell>
                    <TableCell>{order.patient_name}</TableCell>
                    <TableCell>{order.uhid}</TableCell>
                    <TableCell>
                      <Typography variant="body2">
                        {order.item_count || 0} test(s)
                      </Typography>
                    </TableCell>
                    <TableCell>{getPriorityChip(order.priority)}</TableCell>
                    <TableCell>{order.doctor_name || 'Unassigned'}</TableCell>
                    <TableCell>
                      {new Date(order.order_date).toLocaleString()}
                    </TableCell>
                    <TableCell>{getStatusChip(order.status)}</TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', gap: 1 }}>
                        {order.status === 'pending' && (
                          <Button
                            size="small"
                            variant="contained"
                            color="primary"
                            onClick={() => handleStartOrder(order)}
                          >
                            Start
                          </Button>
                        )}
                        {order.status === 'in-progress' && (
                          <Button
                            size="small"
                            variant="contained"
                            color="success"
                            onClick={() => handleOpenResultsDialog(order)}
                          >
                            Enter Results
                          </Button>
                        )}
                        {order.status === 'completed' && (
                          <>
                            <IconButton
                              size="small"
                              color="primary"
                              onClick={() => handleViewOrder(order)}
                            >
                              <VisibilityIcon />
                            </IconButton>
                            <IconButton size="small" color="primary">
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

      {/* Enter Results Dialog */}
      <Dialog open={resultsDialogOpen} onClose={() => setResultsDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>
          Enter Lab Results - {selectedOrder?.order_number}
          <Typography variant="body2" color="textSecondary">
            Patient: {selectedOrder?.patient_name} ({selectedOrder?.uhid})
          </Typography>
        </DialogTitle>
        <DialogContent dividers>
          {selectedOrder?.items && selectedOrder.items.length > 0 ? (
            selectedOrder.items.map((item, index) => (
              <Box key={item.id} sx={{ mb: 3 }}>
                <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
                  {index + 1}. {item.test_name}
                </Typography>
                <Grid container spacing={2}>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      label="Result"
                      fullWidth
                      value={results[item.id]?.result || ''}
                      onChange={(e) => handleResultChange(item.id, 'result', e.target.value)}
                      required
                    />
                  </Grid>
                  <Grid item xs={12} sm={3}>
                    <TextField
                      label="Unit"
                      fullWidth
                      value={results[item.id]?.unit || item.unit || ''}
                      onChange={(e) => handleResultChange(item.id, 'unit', e.target.value)}
                    />
                  </Grid>
                  <Grid item xs={12} sm={3}>
                    <TextField
                      label="Reference Range"
                      fullWidth
                      value={results[item.id]?.reference_range || item.normal_range || ''}
                      onChange={(e) => handleResultChange(item.id, 'reference_range', e.target.value)}
                    />
                  </Grid>
                  <Grid item xs={12}>
                    <TextField
                      label="Notes"
                      fullWidth
                      multiline
                      rows={2}
                      value={results[item.id]?.notes || ''}
                      onChange={(e) => handleResultChange(item.id, 'notes', e.target.value)}
                    />
                  </Grid>
                </Grid>
                {index < selectedOrder.items.length - 1 && <Divider sx={{ mt: 2 }} />}
              </Box>
            ))
          ) : (
            <Alert severity="info">No test items found for this order.</Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setResultsDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" color="primary" onClick={handleSubmitResults}>
            Submit Results & Complete Order
          </Button>
        </DialogActions>
      </Dialog>

      {/* View Order Dialog */}
      <Dialog open={viewDialogOpen} onClose={() => setViewDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>
          Lab Order Details - {selectedOrder?.order_number}
        </DialogTitle>
        <DialogContent dividers>
          {selectedOrder && (
            <Box>
              <Grid container spacing={2} sx={{ mb: 3 }}>
                <Grid item xs={6}>
                  <Typography variant="body2" color="textSecondary">Patient:</Typography>
                  <Typography variant="body1" fontWeight="bold">
                    {selectedOrder.patient_name} ({selectedOrder.uhid})
                  </Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2" color="textSecondary">Ordered By:</Typography>
                  <Typography variant="body1">{selectedOrder.doctor_name || 'Unassigned'}</Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2" color="textSecondary">Order Date:</Typography>
                  <Typography variant="body1">
                    {new Date(selectedOrder.order_date).toLocaleString()}
                  </Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2" color="textSecondary">Priority:</Typography>
                  <Typography variant="body1">{getPriorityChip(selectedOrder.priority)}</Typography>
                </Grid>
              </Grid>

              <Divider sx={{ my: 2 }} />

              <Typography variant="h6" gutterBottom>Test Results</Typography>
              {selectedOrder.items && selectedOrder.items.map((item, index) => (
                <Box key={item.id} sx={{ mb: 2, p: 2, bgcolor: 'grey.50', borderRadius: 1 }}>
                  <Typography variant="subtitle1" fontWeight="bold">{item.test_name}</Typography>
                  <Grid container spacing={2} sx={{ mt: 1 }}>
                    <Grid item xs={4}>
                      <Typography variant="body2" color="textSecondary">Result:</Typography>
                      <Typography variant="body1" fontWeight="bold">{item.result_value || 'N/A'}</Typography>
                    </Grid>
                    <Grid item xs={4}>
                      <Typography variant="body2" color="textSecondary">Reference Range:</Typography>
                      <Typography variant="body1">{[item.reference_min, item.reference_max].filter(Boolean).join(' – ') || 'N/A'}</Typography>
                    </Grid>
                    <Grid item xs={4}>
                      <Typography variant="body2" color="textSecondary">Unit:</Typography>
                      <Typography variant="body1">{item.result_unit || 'N/A'}</Typography>
                    </Grid>
                    {item.result_notes && (
                      <Grid item xs={12}>
                        <Typography variant="body2" color="textSecondary">Notes:</Typography>
                        <Typography variant="body2">{item.result_notes}</Typography>
                      </Grid>
                    )}
                  </Grid>
                </Box>
              ))}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setViewDialogOpen(false)}>Close</Button>
          <Button variant="contained" color="primary" startIcon={<PrintIcon />}>
            Print Report
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default LaboratoryPage;

