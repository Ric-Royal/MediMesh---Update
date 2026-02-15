import React, { useState, useEffect } from 'react';
import {
  Container, Paper, Typography, Box, Tab, Tabs, Grid, Card, CardContent,
  Button, Chip, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField,
  IconButton, Alert, CircularProgress, Divider
} from '@mui/material';
import {
  CameraAlt as CameraIcon,
  Pending as PendingIcon,
  CheckCircle as CheckCircleIcon,
  Print as PrintIcon,
  Visibility as VisibilityIcon,
  Biotech as RadiologyIcon
} from '@mui/icons-material';
import API_CONFIG from '../config/api';
import { useNotification } from '../contexts/NotificationContext';

const RadiologyPage = () => {
  const { notifySuccess, notifyError } = useNotification();
  const [activeTab, setActiveTab] = useState(0);
  const [loading, setLoading] = useState(false);
  const [orders, setOrders] = useState([]);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [reportDialogOpen, setReportDialogOpen] = useState(false);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [reports, setReports] = useState({});

  // Fetch radiology orders
  const fetchOrders = async (status = 'ordered') => {
    setLoading(true);
    try {
      const response = await fetch(`${API_CONFIG.endpoints.radiology.orders}?status=${status}`, {
        headers: API_CONFIG.getAuthHeaders(),
      });
      if (response.ok) {
        const data = await response.json();
        setOrders(data.data || []);
      } else {
        notifyError('Failed to fetch radiology orders');
      }
    } catch (error) {
      console.error('Error fetching radiology orders:', error);
      notifyError('An error occurred while fetching radiology orders');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const statusMap = ['ordered', 'performed', 'reported'];
    fetchOrders(statusMap[activeTab]);
  }, [activeTab]);

  const handleTabChange = (event, newValue) => {
    setActiveTab(newValue);
  };

  const handleStartOrder = async (order) => {
    try {
      const response = await fetch(`${API_CONFIG.endpoints.radiology.orders}/${order.id}`, {
        method: 'PUT',
        headers: API_CONFIG.getAuthHeaders(),
        body: JSON.stringify({ status: 'performed' }),
      });
      if (response.ok) {
        notifySuccess('Imaging started');
        fetchOrders('ordered');
      } else {
        notifyError('Failed to start imaging');
      }
    } catch (error) {
      console.error('Error starting imaging:', error);
      notifyError('An error occurred');
    }
  };

  const handleOpenReportDialog = async (order) => {
    try {
      const response = await fetch(`${API_CONFIG.endpoints.radiology.orders}/${order.id}`, {
        headers: API_CONFIG.getAuthHeaders(),
      });
      if (response.ok) {
        const data = await response.json();
        const orderDetails = data.data;
        
        // Initialize reports object with study items
        const initialReports = {};
        if (orderDetails.items) {
          orderDetails.items.forEach(item => {
            initialReports[item.id] = {
              findings: item.findings || '',
              impression: item.impression || '',
              notes: item.notes || '',
            };
          });
        }
        setReports(initialReports);
        setSelectedOrder(orderDetails);
        setReportDialogOpen(true);
      }
    } catch (error) {
      console.error('Error fetching order details:', error);
      notifyError('Failed to load order details');
    }
  };

  const handleReportChange = (itemId, field, value) => {
    setReports(prev => ({
      ...prev,
      [itemId]: {
        ...prev[itemId],
        [field]: value,
      },
    }));
  };

  const handleSubmitReport = async () => {
    if (!selectedOrder) return;

    try {
      // Update each study report
      for (const [itemId, reportData] of Object.entries(reports)) {
        await fetch(`${API_CONFIG.endpoints.radiology.orders}/${selectedOrder.id}/items/${itemId}`, {
          method: 'PUT',
          headers: API_CONFIG.getAuthHeaders(),
          body: JSON.stringify({
            findings: reportData.findings,
            impression: reportData.impression,
            notes: reportData.notes,
            status: 'reported',
          }),
        });
      }

      // Mark order as reported/completed
      const response = await fetch(`${API_CONFIG.endpoints.radiology.orders}/${selectedOrder.id}`, {
        method: 'PUT',
        headers: API_CONFIG.getAuthHeaders(),
        body: JSON.stringify({ status: 'reported' }),
      });

      if (response.ok) {
        notifySuccess('Radiology report submitted successfully! Invoice updated automatically.');
        setReportDialogOpen(false);
        setSelectedOrder(null);
        fetchOrders('performed');
      } else {
        notifyError('Failed to submit report');
      }
    } catch (error) {
      console.error('Error submitting report:', error);
      notifyError('An error occurred while submitting report');
    }
  };

  const handleViewOrder = async (order) => {
    try {
      const response = await fetch(`${API_CONFIG.endpoints.radiology.orders}/${order.id}`, {
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
      ordered: { color: 'warning', icon: <PendingIcon fontSize="small" /> },
      scheduled: { color: 'info', icon: <CameraIcon fontSize="small" /> },
      performed: { color: 'info', icon: <RadiologyIcon fontSize="small" /> },
      reported: { color: 'success', icon: <CheckCircleIcon fontSize="small" /> },
    };
    const config = statusConfig[status] || statusConfig.ordered;
    return (
      <Chip
        label={status.toUpperCase()}
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
    <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
        <RadiologyIcon sx={{ fontSize: 40, mr: 2, color: 'primary.main' }} />
        <Typography variant="h4" component="h1">
          Radiology & Imaging
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
                    {orders.filter(o => o.status === 'ordered').length}
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
                    Awaiting Report
                  </Typography>
                  <Typography variant="h4">
                    {orders.filter(o => o.status === 'performed').length}
                  </Typography>
                </Box>
                <RadiologyIcon sx={{ fontSize: 48, color: 'info.main', opacity: 0.3 }} />
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
                    {orders.filter(o => o.status === 'reported').length}
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
          <Tab label="Ordered" icon={<PendingIcon />} iconPosition="start" />
          <Tab label="Awaiting Report" icon={<RadiologyIcon />} iconPosition="start" />
          <Tab label="Reported" icon={<CheckCircleIcon />} iconPosition="start" />
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
                <TableCell>Studies</TableCell>
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
                        {order.radiology_order_number}
                      </Typography>
                    </TableCell>
                    <TableCell>{order.patient_name}</TableCell>
                    <TableCell>{order.uhid}</TableCell>
                    <TableCell>
                      <Typography variant="body2">
                        {order.study_count || 0} study(ies)
                      </Typography>
                    </TableCell>
                    <TableCell>{getPriorityChip(order.priority)}</TableCell>
                    <TableCell>{order.ordering_doctor_name}</TableCell>
                    <TableCell>
                      {new Date(order.order_date).toLocaleString()}
                    </TableCell>
                    <TableCell>{getStatusChip(order.status)}</TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', gap: 1 }}>
                        {order.status === 'ordered' && (
                          <Button
                            size="small"
                            variant="contained"
                            color="primary"
                            onClick={() => handleStartOrder(order)}
                          >
                            Start Imaging
                          </Button>
                        )}
                        {order.status === 'performed' && (
                          <Button
                            size="small"
                            variant="contained"
                            color="success"
                            onClick={() => handleOpenReportDialog(order)}
                          >
                            Enter Report
                          </Button>
                        )}
                        {order.status === 'reported' && (
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

      {/* Enter Report Dialog */}
      <Dialog open={reportDialogOpen} onClose={() => setReportDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>
          Enter Radiology Report - {selectedOrder?.radiology_order_number}
          <Typography variant="body2" color="textSecondary">
            Patient: {selectedOrder?.patient_name} ({selectedOrder?.uhid})
          </Typography>
        </DialogTitle>
        <DialogContent dividers>
          {selectedOrder?.items && selectedOrder.items.length > 0 ? (
            selectedOrder.items.map((item, index) => (
              <Box key={item.id} sx={{ mb: 3 }}>
                <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
                  {index + 1}. {item.study_name}
                </Typography>
                <Grid container spacing={2}>
                  <Grid item xs={12}>
                    <TextField
                      label="Findings *"
                      fullWidth
                      multiline
                      rows={4}
                      value={reports[item.id]?.findings || ''}
                      onChange={(e) => handleReportChange(item.id, 'findings', e.target.value)}
                      required
                      placeholder="Describe the imaging findings in detail..."
                    />
                  </Grid>
                  <Grid item xs={12}>
                    <TextField
                      label="Impression/Conclusion *"
                      fullWidth
                      multiline
                      rows={3}
                      value={reports[item.id]?.impression || ''}
                      onChange={(e) => handleReportChange(item.id, 'impression', e.target.value)}
                      required
                      placeholder="Provide clinical impression and conclusion..."
                    />
                  </Grid>
                  <Grid item xs={12}>
                    <TextField
                      label="Additional Notes"
                      fullWidth
                      multiline
                      rows={2}
                      value={reports[item.id]?.notes || ''}
                      onChange={(e) => handleReportChange(item.id, 'notes', e.target.value)}
                      placeholder="Any additional notes or recommendations..."
                    />
                  </Grid>
                </Grid>
                {index < selectedOrder.items.length - 1 && <Divider sx={{ mt: 2 }} />}
              </Box>
            ))
          ) : (
            <Alert severity="info">No study items found for this order.</Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setReportDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" color="primary" onClick={handleSubmitReport}>
            Submit Report & Complete Order
          </Button>
        </DialogActions>
      </Dialog>

      {/* View Order Dialog */}
      <Dialog open={viewDialogOpen} onClose={() => setViewDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>
          Radiology Report - {selectedOrder?.radiology_order_number}
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
                  <Typography variant="body1">{selectedOrder.ordering_doctor_name}</Typography>
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

              <Typography variant="h6" gutterBottom>Imaging Reports</Typography>
              {selectedOrder.items && selectedOrder.items.map((item, index) => (
                <Box key={item.id} sx={{ mb: 3, p: 2, bgcolor: 'grey.50', borderRadius: 1 }}>
                  <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
                    {item.study_name}
                  </Typography>
                  <Box sx={{ mt: 2 }}>
                    <Typography variant="body2" color="textSecondary" fontWeight="bold">
                      Findings:
                    </Typography>
                    <Typography variant="body2" sx={{ mt: 1, whiteSpace: 'pre-wrap' }}>
                      {item.findings || 'No findings recorded'}
                    </Typography>
                  </Box>
                  <Box sx={{ mt: 2 }}>
                    <Typography variant="body2" color="textSecondary" fontWeight="bold">
                      Impression:
                    </Typography>
                    <Typography variant="body2" sx={{ mt: 1, whiteSpace: 'pre-wrap' }}>
                      {item.impression || 'No impression recorded'}
                    </Typography>
                  </Box>
                  {item.notes && (
                    <Box sx={{ mt: 2 }}>
                      <Typography variant="body2" color="textSecondary" fontWeight="bold">
                        Additional Notes:
                      </Typography>
                      <Typography variant="body2" sx={{ mt: 1, whiteSpace: 'pre-wrap' }}>
                        {item.notes}
                      </Typography>
                    </Box>
                  )}
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
    </Container>
  );
};

export default RadiologyPage;

