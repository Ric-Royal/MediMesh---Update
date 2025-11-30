import React, { useState, useEffect } from 'react';
import {
  Container,
  Paper,
  Typography,
  Box,
  Tabs,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Button,
  Chip,
  TextField,
  InputAdornment,
  Grid,
  Card,
  CardContent,
  Badge,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import ScienceIcon from '@mui/icons-material/Science';
import QueueIcon from '@mui/icons-material/Queue';
import AssignmentIcon from '@mui/icons-material/Assignment';
import RefreshIcon from '@mui/icons-material/Refresh';
import BarChart from '@mui/icons-material/BarChart';
import WarningIcon from '@mui/icons-material/Warning';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';

const LabWorkflowPage = () => {
  const [activeTab, setActiveTab] = useState(0);
  const [labQueue, setLabQueue] = useState([]);
  const [labOrders, setLabOrders] = useState([]);
  const [statistics, setStatistics] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  useEffect(() => {
    fetchStatistics();
  }, []);

  useEffect(() => {
    if (activeTab === 0) {
      fetchLabQueue();
    } else if (activeTab === 1) {
      fetchLabOrders();
    }
  }, [activeTab]);

  const fetchStatistics = async () => {
    try {
      const response = await fetch('http://localhost:3001/api/lab/statistics', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token') || 'dev-token'}` }
      });
      if (response.ok) {
        const data = await response.json();
        setStatistics(data.data);
      }
    } catch (error) {
      console.error('Error fetching statistics:', error);
    }
  };

  const fetchLabQueue = async () => {
    setLoading(true);
    try {
      const response = await fetch('http://localhost:3001/api/lab/queue', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token') || 'dev-token'}` }
      });
      if (response.ok) {
        const data = await response.json();
        setLabQueue(data.data || []);
      }
    } catch (error) {
      console.error('Error fetching lab queue:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchLabOrders = async () => {
    setLoading(true);
    try {
      const url = searchTerm
        ? `http://localhost:3001/api/lab/orders?search=${searchTerm}`
        : 'http://localhost:3001/api/lab/orders';
      
      const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token') || 'dev-token'}` }
      });
      if (response.ok) {
        const data = await response.json();
        setLabOrders(data.data || []);
      }
    } catch (error) {
      console.error('Error fetching lab orders:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleViewDetails = async (orderId) => {
    try {
      const response = await fetch(`http://localhost:3001/api/lab/orders/${orderId}`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token') || 'dev-token'}` }
      });
      if (response.ok) {
        const data = await response.json();
        setSelectedOrder(data.data);
        setDetailsOpen(true);
      }
    } catch (error) {
      console.error('Error fetching order details:', error);
    }
  };

  const getPriorityColor = (priority) => {
    const colors = {
      'routine': 'default',
      'urgent': 'warning',
      'stat': 'error',
      'emergency': 'error'
    };
    return colors[priority] || 'default';
  };

  const getStatusColor = (status) => {
    const colors = {
      'pending': 'warning',
      'sample-collected': 'info',
      'in-progress': 'primary',
      'completed': 'success',
      'cancelled': 'error'
    };
    return colors[status] || 'default';
  };

  const getResultFlagColor = (flag) => {
    const colors = {
      'normal': 'success',
      'low': 'warning',
      'high': 'error',
      'critical': 'error'
    };
    return colors[flag] || 'default';
  };

  return (
    <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <ScienceIcon sx={{ fontSize: 40, color: 'primary.main' }} />
          <Typography variant="h4" component="h1" fontWeight="bold">
            🔬 Laboratory Workflow
          </Typography>
        </Box>
        <Button
          startIcon={<RefreshIcon />}
          onClick={() => {
            fetchStatistics();
            if (activeTab === 0) fetchLabQueue();
            else if (activeTab === 1) fetchLabOrders();
          }}
          disabled={loading}
        >
          Refresh
        </Button>
      </Box>

      {/* Statistics Cards */}
      {statistics && (
        <Grid container spacing={2} sx={{ mb: 3 }}>
          <Grid item xs={12} sm={6} md={2.4}>
            <Card>
              <CardContent>
                <Typography color="text.secondary" gutterBottom variant="body2">
                  Pending Orders
                </Typography>
                <Typography variant="h3" component="div" color="warning.main">
                  {statistics.pending_orders || 0}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={2.4}>
            <Card>
              <CardContent>
                <Typography color="text.secondary" gutterBottom variant="body2">
                  In Progress
                </Typography>
                <Typography variant="h3" component="div" color="primary.main">
                  {statistics.in_progress || 0}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={2.4}>
            <Card>
              <CardContent>
                <Typography color="text.secondary" gutterBottom variant="body2">
                  Completed Today
                </Typography>
                <Typography variant="h3" component="div" color="success.main">
                  {statistics.completed_today || 0}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={2.4}>
            <Card>
              <CardContent>
                <Typography color="text.secondary" gutterBottom variant="body2">
                  Abnormal Results
                </Typography>
                <Typography variant="h3" component="div" color="error.main">
                  {statistics.abnormal_results || 0}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={2.4}>
            <Card>
              <CardContent>
                <Typography color="text.secondary" gutterBottom variant="body2">
                  Avg Wait Time
                </Typography>
                <Typography variant="h3" component="div">
                  {Math.round(statistics.avg_wait_time_minutes || 0)}m
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {/* Tabs */}
      <Paper sx={{ mb: 2 }}>
        <Tabs value={activeTab} onChange={(e, newValue) => setActiveTab(newValue)}>
          <Tab
            icon={
              <Badge badgeContent={statistics?.queue_waiting || 0} color="warning">
                <QueueIcon />
              </Badge>
            }
            label="Sample Collection Queue"
            iconPosition="start"
          />
          <Tab
            icon={<AssignmentIcon />}
            label="All Lab Orders"
            iconPosition="start"
          />
          <Tab
            icon={<BarChart />}
            label="Results & Reports"
            iconPosition="start"
          />
        </Tabs>
      </Paper>

      {/* Tab Content */}
      {activeTab === 0 && (
        <Paper>
          <Box sx={{ p: 2 }}>
            <Typography variant="h6">
              Sample Collection Queue ({labQueue.length} waiting)
            </Typography>
          </Box>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow sx={{ backgroundColor: 'primary.main' }}>
                  <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>Order #</TableCell>
                  <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>Patient</TableCell>
                  <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>UHID</TableCell>
                  <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>Tests</TableCell>
                  <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>Priority</TableCell>
                  <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>Waiting Time</TableCell>
                  <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>Status</TableCell>
                  <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {labQueue.map((entry) => (
                  <TableRow key={entry.id} sx={{
                    backgroundColor: entry.priority === 'emergency' || entry.priority === 'stat' ? 'error.light' : 'inherit'
                  }}>
                    <TableCell>
                      <Typography variant="body2" fontWeight="bold">
                        {entry.order_number}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography>{entry.patient_name}</Typography>
                    </TableCell>
                    <TableCell>
                      <Chip label={entry.uhid} size="small" />
                    </TableCell>
                    <TableCell>
                      <Chip label={`${entry.test_count} tests`} size="small" color="info" />
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={entry.priority}
                        color={getPriorityColor(entry.priority)}
                        size="small"
                        icon={entry.priority === 'emergency' || entry.priority === 'stat' ? <WarningIcon /> : undefined}
                      />
                    </TableCell>
                    <TableCell>
                      <Typography
                        fontWeight="bold"
                        color={
                          entry.waiting_minutes > 30 ? 'error.main' :
                          entry.waiting_minutes > 15 ? 'warning.main' : 'text.primary'
                        }
                      >
                        {Math.round(entry.waiting_minutes || 0)} min
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip label={entry.status} color={getStatusColor(entry.status)} size="small" />
                    </TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', gap: 1 }}>
                        <Button size="small" variant="outlined" onClick={() => handleViewDetails(entry.lab_order_id)}>
                          View
                        </Button>
                        <Button size="small" variant="contained" color="primary">
                          Collect
                        </Button>
                      </Box>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}

      {activeTab === 1 && (
        <>
          {/* Search Bar */}
          <Paper sx={{ p: 2, mb: 3 }}>
            <TextField
              fullWidth
              placeholder="Search lab orders by order number, patient name, UHID..."
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
          </Paper>

          <Paper>
            <Box sx={{ p: 2 }}>
              <Typography variant="h6">
                All Lab Orders ({labOrders.length})
              </Typography>
            </Box>
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow sx={{ backgroundColor: 'primary.main' }}>
                    <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>Order #</TableCell>
                    <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>Date</TableCell>
                    <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>Patient</TableCell>
                    <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>Doctor</TableCell>
                    <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>Tests</TableCell>
                    <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>Priority</TableCell>
                    <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>Status</TableCell>
                    <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>Progress</TableCell>
                    <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {labOrders.map((order) => (
                    <TableRow key={order.id}>
                      <TableCell>
                        <Typography variant="body2" fontWeight="bold">
                          {order.order_number}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        {new Date(order.order_date).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <Typography>{order.patient_name}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {order.uhid}
                        </Typography>
                      </TableCell>
                      <TableCell>{order.doctor_name}</TableCell>
                      <TableCell>
                        <Chip label={`${order.item_count} tests`} size="small" color="info" />
                      </TableCell>
                      <TableCell>
                        <Chip label={order.priority} color={getPriorityColor(order.priority)} size="small" />
                      </TableCell>
                      <TableCell>
                        <Chip label={order.status} color={getStatusColor(order.status)} size="small" />
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">
                          {order.completed_items}/{order.item_count}
                        </Typography>
                        {order.status === 'completed' && (
                          <CheckCircleIcon color="success" sx={{ fontSize: 20, ml: 1 }} />
                        )}
                      </TableCell>
                      <TableCell>
                        <Button size="small" variant="outlined" onClick={() => handleViewDetails(order.id)}>
                          Details
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        </>
      )}

      {activeTab === 2 && (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <BarChart sx={{ fontSize: 60, color: 'text.secondary', mb: 2 }} />
          <Typography variant="h6" color="text.secondary">
            Results & Reports Dashboard
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            Advanced reporting and analytics coming soon...
          </Typography>
        </Paper>
      )}

      {/* Order Details Dialog */}
      <Dialog open={detailsOpen} onClose={() => setDetailsOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>Lab Order Details</DialogTitle>
        <DialogContent>
          {selectedOrder && (
            <Box>
              <Grid container spacing={2} sx={{ mb: 3 }}>
                <Grid item xs={6}>
                  <Typography variant="subtitle2" color="text.secondary">Order Number:</Typography>
                  <Typography variant="body1" fontWeight="bold">{selectedOrder.order_number}</Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="subtitle2" color="text.secondary">Patient:</Typography>
                  <Typography variant="body1">{selectedOrder.patient_name} ({selectedOrder.uhid})</Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="subtitle2" color="text.secondary">Ordering Doctor:</Typography>
                  <Typography variant="body1">{selectedOrder.doctor_name}</Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="subtitle2" color="text.secondary">Priority:</Typography>
                  <Chip label={selectedOrder.priority} color={getPriorityColor(selectedOrder.priority)} size="small" />
                </Grid>
              </Grid>

              <Typography variant="h6" sx={{ mb: 2 }}>Test Items:</Typography>
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Test Name</TableCell>
                      <TableCell>Specimen</TableCell>
                      <TableCell>Barcode</TableCell>
                      <TableCell>Result</TableCell>
                      <TableCell>Status</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {selectedOrder.items?.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>{item.test_name}</TableCell>
                        <TableCell>{item.specimen_type}</TableCell>
                        <TableCell>
                          <Chip label={item.sample_barcode || 'Not collected'} size="small" variant="outlined" />
                        </TableCell>
                        <TableCell>
                          {item.result_value ? (
                            <Box>
                              <Typography variant="body2">{item.result_value} {item.result_unit}</Typography>
                              {item.result_flag && item.result_flag !== 'normal' && (
                                <Chip label={item.result_flag} color={getResultFlagColor(item.result_flag)} size="small" />
                              )}
                            </Box>
                          ) : '-'}
                        </TableCell>
                        <TableCell>
                          <Chip label={item.status} color={getStatusColor(item.status)} size="small" />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDetailsOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default LabWorkflowPage;

