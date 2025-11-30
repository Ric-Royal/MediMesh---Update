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
  Grid,
  Card,
  CardContent,
  Badge
} from '@mui/material';
import CameraAltIcon from '@mui/icons-material/CameraAlt';
import QueueIcon from '@mui/icons-material/Queue';
import AssignmentIcon from '@mui/icons-material/Assignment';
import RefreshIcon from '@mui/icons-material/Refresh';
import WarningIcon from '@mui/icons-material/Warning';

const RadiologyWorkflowPage = () => {
  const [activeTab, setActiveTab] = useState(0);
  const [radiologyQueue, setRadiologyQueue] = useState([]);
  const [radiologyOrders, setRadiologyOrders] = useState([]);
  const [statistics, setStatistics] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchStatistics();
  }, []);

  useEffect(() => {
    if (activeTab === 0) fetchRadiologyQueue();
    else if (activeTab === 1) fetchRadiologyOrders();
  }, [activeTab]);

  const fetchStatistics = async () => {
    try {
      const response = await fetch('http://localhost:3001/api/radiology/statistics', {
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

  const fetchRadiologyQueue = async () => {
    setLoading(true);
    try {
      const response = await fetch('http://localhost:3001/api/radiology/queue', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token') || 'dev-token'}` }
      });
      if (response.ok) {
        const data = await response.json();
        setRadiologyQueue(data.data || []);
      }
    } catch (error) {
      console.error('Error fetching radiology queue:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchRadiologyOrders = async () => {
    setLoading(true);
    try {
      const response = await fetch('http://localhost:3001/api/radiology/orders', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token') || 'dev-token'}` }
      });
      if (response.ok) {
        const data = await response.json();
        setRadiologyOrders(data.data || []);
      }
    } catch (error) {
      console.error('Error fetching radiology orders:', error);
    } finally {
      setLoading(false);
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
      'scheduled': 'info',
      'in-progress': 'primary',
      'completed': 'success',
      'reported': 'success',
      'cancelled': 'error'
    };
    return colors[status] || 'default';
  };

  return (
    <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <CameraAltIcon sx={{ fontSize: 40, color: 'primary.main' }} />
          <Typography variant="h4" component="h1" fontWeight="bold">
            📸 Radiology & Imaging
          </Typography>
        </Box>
        <Button
          startIcon={<RefreshIcon />}
          onClick={() => {
            fetchStatistics();
            if (activeTab === 0) fetchRadiologyQueue();
            else if (activeTab === 1) fetchRadiologyOrders();
          }}
          disabled={loading}
        >
          Refresh
        </Button>
      </Box>

      {/* Statistics */}
      {statistics && (
        <Grid container spacing={2} sx={{ mb: 3 }}>
          <Grid item xs={12} sm={6} md={2.4}>
            <Card>
              <CardContent>
                <Typography color="text.secondary" gutterBottom variant="body2">
                  Queue Waiting
                </Typography>
                <Typography variant="h3" component="div" color="warning.main">
                  {statistics.queue_waiting || 0}
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
                  Critical Findings
                </Typography>
                <Typography variant="h3" component="div" color="error.main">
                  {statistics.critical_findings_today || 0}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={2.4}>
            <Card>
              <CardContent>
                <Typography color="text.secondary" gutterBottom variant="body2">
                  Pending Orders
                </Typography>
                <Typography variant="h3" component="div">
                  {statistics.pending_orders || 0}
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
            label="Imaging Queue"
            iconPosition="start"
          />
          <Tab
            icon={<AssignmentIcon />}
            label="All Orders"
            iconPosition="start"
          />
        </Tabs>
      </Paper>

      {/* Queue Tab */}
      {activeTab === 0 && (
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow sx={{ backgroundColor: 'primary.main' }}>
                <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>Order #</TableCell>
                <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>Patient</TableCell>
                <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>UHID</TableCell>
                <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>Modality</TableCell>
                <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>Priority</TableCell>
                <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>Status</TableCell>
                <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {radiologyQueue.map((entry) => (
                <TableRow key={entry.id} sx={{
                  backgroundColor: entry.priority === 'emergency' || entry.priority === 'stat' ? 'error.light' : 'inherit'
                }}>
                  <TableCell><Typography fontWeight="bold">{entry.order_number}</Typography></TableCell>
                  <TableCell>{entry.patient_name}</TableCell>
                  <TableCell><Chip label={entry.uhid} size="small" /></TableCell>
                  <TableCell><Chip label={entry.modality_name} size="small" color="info" /></TableCell>
                  <TableCell>
                    <Chip
                      label={entry.priority}
                      color={getPriorityColor(entry.priority)}
                      size="small"
                      icon={entry.priority === 'emergency' ? <WarningIcon /> : undefined}
                    />
                  </TableCell>
                  <TableCell><Chip label={entry.status} color={getStatusColor(entry.status)} size="small" /></TableCell>
                  <TableCell>
                    <Button size="small" variant="contained">Start Imaging</Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Orders Tab */}
      {activeTab === 1 && (
        <TableContainer component={Paper}>
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
              {radiologyOrders.map((order) => (
                <TableRow key={order.id}>
                  <TableCell><Typography fontWeight="bold">{order.order_number}</Typography></TableCell>
                  <TableCell>{new Date(order.order_date).toLocaleDateString()}</TableCell>
                  <TableCell>
                    <Typography>{order.patient_name}</Typography>
                    <Typography variant="caption" color="text.secondary">{order.uhid}</Typography>
                  </TableCell>
                  <TableCell>{order.doctor_name}</TableCell>
                  <TableCell><Chip label={`${order.item_count} tests`} size="small" color="info" /></TableCell>
                  <TableCell><Chip label={order.priority} color={getPriorityColor(order.priority)} size="small" /></TableCell>
                  <TableCell><Chip label={order.status} color={getStatusColor(order.status)} size="small" /></TableCell>
                  <TableCell>
                    <Typography variant="body2">{order.completed_items}/{order.item_count}</Typography>
                  </TableCell>
                  <TableCell>
                    <Button size="small" variant="outlined">View</Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Container>
  );
};

export default RadiologyWorkflowPage;

