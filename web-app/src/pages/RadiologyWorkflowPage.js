import React, { useState, useEffect, useMemo } from 'react';
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
  Badge,
  Fade
} from '@mui/material';
import CameraAltIcon from '@mui/icons-material/CameraAlt';
import QueueIcon from '@mui/icons-material/Queue';
import AssignmentIcon from '@mui/icons-material/Assignment';
import RefreshIcon from '@mui/icons-material/Refresh';
import WarningIcon from '@mui/icons-material/Warning';
import TrendSparkline from '../components/common/TrendSparkline';
import StatusPill from '../components/common/StatusPill';
import PriorityBadge from '../components/common/PriorityBadge';
import ProgressStat from '../components/common/ProgressStat';
import { useNotification } from '../contexts/NotificationContext';

const RadiologyWorkflowPage = () => {
  const [activeTab, setActiveTab] = useState(0);
  const [radiologyQueue, setRadiologyQueue] = useState([]);
  const [radiologyOrders, setRadiologyOrders] = useState([]);
  const [statistics, setStatistics] = useState(null);
  const [loading, setLoading] = useState(false);
  const { notifySuccess, notifyError } = useNotification();

  useEffect(() => {
    fetchStatistics();
  }, []);

  useEffect(() => {
    if (activeTab === 0) fetchRadiologyQueue();
    else if (activeTab === 1) fetchRadiologyOrders();
  }, [activeTab]);

  const fetchStatistics = async (silent = true) => {
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
      if (!silent) {
        notifyError('Unable to load radiology stats');
      }
    }
  };

  const fetchRadiologyQueue = async (silent = true) => {
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
      if (!silent) {
        notifyError('Unable to load imaging queue');
      }
    } finally {
      setLoading(false);
    }
  };

  const fetchRadiologyOrders = async (silent = true) => {
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
      if (!silent) {
        notifyError('Unable to load orders');
      }
    } finally {
      setLoading(false);
    }
  };

  const queueSpark = useMemo(() => {
    if (!radiologyQueue.length) return [];
    return radiologyQueue.slice(0, 8).map((entry, idx) => ({
      label: entry.patient_name?.split(' ')[0] || `Case ${idx + 1}`,
      value: entry.wait_time_minutes || (entry.priority === 'emergency' ? 60 : 30),
    }));
  }, [radiologyQueue]);

  const ordersSpark = useMemo(() => {
    if (!radiologyOrders.length) return [];
    return radiologyOrders.slice(0, 8).map((order, idx) => ({
      label: order.order_number || `O${idx + 1}`,
      value: order.completed_items || 0,
    }));
  }, [radiologyOrders]);

  const criticalLoad = useMemo(
    () =>
      radiologyQueue.filter((entry) =>
        ['emergency', 'stat'].includes((entry.priority || '').toLowerCase())
      ).length,
    [radiologyQueue]
  );

  const inProgressRate = useMemo(() => {
    if (!radiologyQueue.length) return 0;
    const active = radiologyQueue.filter((entry) => entry.status === 'in-progress').length;
    return Math.round((active / radiologyQueue.length) * 100);
  }, [radiologyQueue]);

  const completionRate = useMemo(() => {
    if (!radiologyOrders.length) return 0;
    const completed = radiologyOrders.filter((order) =>
      ['completed', 'reported'].includes((order.status || '').toLowerCase())
    ).length;
    return Math.round((completed / radiologyOrders.length) * 100);
  }, [radiologyOrders]);

  const statCards = useMemo(
    () => [
      {
        title: 'Queue Waiting',
        value: statistics?.queue_waiting || 0,
        color: 'warning.main',
        data: queueSpark,
      },
      {
        title: 'In Progress',
        value: statistics?.in_progress || 0,
        color: 'primary.main',
        data: queueSpark,
      },
      {
        title: 'Completed Today',
        value: statistics?.completed_today || 0,
        color: 'success.main',
        data: ordersSpark,
      },
      {
        title: 'Critical Findings',
        value: statistics?.critical_findings_today || 0,
        color: 'error.main',
        data: queueSpark,
      },
    ],
    [statistics, queueSpark, ordersSpark]
  );

  const handleRefresh = async () => {
    await Promise.all([
      fetchStatistics(false),
      fetchRadiologyQueue(false),
      fetchRadiologyOrders(false),
    ]);
    notifySuccess('Radiology data refreshed');
  };

  return (
    <Container sx={{ mt: 4, mb: 4 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <CameraAltIcon sx={{ fontSize: 40, color: 'primary.main' }} />
          <Typography variant="h4" component="h1" fontWeight="bold">
            📸 Radiology & Imaging
          </Typography>
        </Box>
        <Button
          startIcon={<RefreshIcon />}
          onClick={handleRefresh}
          disabled={loading}
        >
          Refresh
        </Button>
      </Box>

      {statistics && (
        <>
          <Fade in>
            <Grid container spacing={2} sx={{ mb: 3 }}>
              {statCards.map((card) => (
                <Grid item xs={12} sm={6} md={2.4} key={card.title}>
                  <Card>
                    <CardContent>
                      <Typography color="text.secondary" gutterBottom variant="body2">
                        {card.title}
                      </Typography>
                      <Typography variant="h4" component="div" color={card.color} fontWeight={700}>
                        {card.value}
                      </Typography>
                      <TrendSparkline data={card.data} />
                    </CardContent>
                  </Card>
                </Grid>
              ))}
            </Grid>
          </Fade>
          <Grid container spacing={2} sx={{ mb: 3 }}>
            <Grid item xs={12} md={6}>
              <Paper sx={{ p: 3 }}>
                <Typography variant="h6" gutterBottom>
                  Imaging Performance
                </Typography>
                <ProgressStat
                  label="In Progress Utilization"
                  value={inProgressRate}
                  color="primary"
                  helperText={`${statistics.in_progress || 0} scans running`}
                />
                <ProgressStat
                  label="Completion Rate"
                  value={completionRate}
                  color="success"
                  helperText={`${statistics.completed_today || 0} completed today`}
                />
              </Paper>
            </Grid>
            <Grid item xs={12} md={6}>
              <Paper sx={{ p: 3 }}>
                <Typography variant="h6" gutterBottom>
                  Queue Trend
                </Typography>
                <TrendSparkline data={queueSpark} height={180} />
              </Paper>
            </Grid>
          </Grid>
        </>
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
                    <PriorityBadge priority={entry.priority} size="small" />
                  </TableCell>
                  <TableCell>
                    <StatusPill status={entry.status} size="small" />
                  </TableCell>
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
                  <TableCell><PriorityBadge priority={order.priority} size="small" /></TableCell>
                  <TableCell><StatusPill status={order.status} size="small" /></TableCell>
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

