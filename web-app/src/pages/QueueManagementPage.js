import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import {
  Container,
  Paper,
  Typography,
  Box,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  Button,
  Card,
  CardContent,
  Grid,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  CircularProgress,
  Alert
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import FiberManualRecordIcon from '@mui/icons-material/FiberManualRecord';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import WarningIcon from '@mui/icons-material/Warning';

const QueueManagementPage = () => {
  const [queue, setQueue] = useState([]);
  const [statistics, setStatistics] = useState(null);
  const [selectedClinic, setSelectedClinic] = useState('all');
  const [loading, setLoading] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);
  const socketRef = useRef(null);

  useEffect(() => {
    // Initialize WebSocket connection
    const socket = io('http://localhost:3001', {
      transports: ['websocket', 'polling']
    });

    socket.on('connect', () => {
      console.log('WebSocket connected');
      setWsConnected(true);
      
      // Join queue room for selected clinic
      if (selectedClinic !== 'all') {
        socket.emit('join-queue', { clinicId: selectedClinic });
      }
    });

    socket.on('disconnect', () => {
      console.log('WebSocket disconnected');
      setWsConnected(false);
    });

    socket.on('queue-update', (data) => {
      console.log('Received queue update:', data);
      // Refresh queue data when update is received
      fetchQueue();
    });

    socketRef.current = socket;

    return () => {
      socket.disconnect();
    };
  }, []);

  useEffect(() => {
    // Join/leave queue rooms when clinic changes
    if (socketRef.current && socketRef.current.connected) {
      if (selectedClinic !== 'all') {
        socketRef.current.emit('join-queue', { clinicId: selectedClinic });
      }
    }
  }, [selectedClinic]);

  useEffect(() => {
    fetchQueue();
    fetchStatistics();
    
    // Auto-refresh every 30 seconds as backup
    const interval = setInterval(() => {
      if (!wsConnected) {
        fetchQueue();
        fetchStatistics();
      }
    }, 30000);

    return () => clearInterval(interval);
  }, [selectedClinic, wsConnected]);

  const fetchQueue = async () => {
    setLoading(true);
    try {
      const endpoint = selectedClinic === 'all'
        ? 'http://localhost:3001/api/queue'
        : `http://localhost:3001/api/queue/clinic/${selectedClinic}`;
      
      const response = await fetch(endpoint, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token') || 'dev-token'}` }
      });

      if (response.ok) {
        const data = await response.json();
        setQueue(data.data || []);
      }
    } catch (error) {
      console.error('Error fetching queue:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchStatistics = async () => {
    if (selectedClinic === 'all') return;
    
    try {
      const response = await fetch(`http://localhost:3001/api/queue/clinic/${selectedClinic}/statistics`, {
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

  const getStatusColor = (status) => {
    const colors = {
      'waiting': 'warning',
      'called': 'info',
      'in-service': 'primary',
      'completed': 'success',
      'cancelled': 'error'
    };
    return colors[status] || 'default';
  };

  const getWaitTimeColor = (minutes) => {
    if (minutes < 15) return 'success.main';
    if (minutes < 30) return 'warning.main';
    return 'error.main';
  };

  return (
    <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Typography variant="h4" component="h1" fontWeight="bold">
            📋 Queue Management
          </Typography>
          <Chip
            icon={wsConnected ? <FiberManualRecordIcon /> : <WarningIcon />}
            label={wsConnected ? 'Live' : 'Polling'}
            color={wsConnected ? 'success' : 'warning'}
            size="small"
          />
        </Box>
        <Button
          startIcon={<RefreshIcon />}
          onClick={() => { fetchQueue(); fetchStatistics(); }}
          disabled={loading}
        >
          Refresh
        </Button>
      </Box>

      {/* WebSocket Status Alert */}
      {!wsConnected && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Real-time updates unavailable. Using 30-second polling instead.
        </Alert>
      )}

      {/* Statistics Cards */}
      {statistics && (
        <Grid container spacing={2} sx={{ mb: 3 }}>
          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Typography color="text.secondary" gutterBottom variant="body2">
                  Total Waiting
                </Typography>
                <Typography variant="h3" component="div">
                  {statistics.totalWaiting || 0}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Typography color="text.secondary" gutterBottom variant="body2">
                  In Service
                </Typography>
                <Typography variant="h3" component="div" color="primary">
                  {statistics.inService || 0}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Typography color="text.secondary" gutterBottom variant="body2">
                  Avg Wait Time
                </Typography>
                <Typography variant="h3" component="div" color="warning.main">
                  {statistics.averageWaitTime || 0}m
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Typography color="text.secondary" gutterBottom variant="body2">
                  Completed Today
                </Typography>
                <Typography variant="h3" component="div" color="success.main">
                  {statistics.completedToday || 0}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {/* Clinic Filter */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <FormControl fullWidth>
          <InputLabel>Clinic</InputLabel>
          <Select
            value={selectedClinic}
            label="Clinic"
            onChange={(e) => setSelectedClinic(e.target.value)}
          >
            <MenuItem value="all">All Clinics</MenuItem>
            <MenuItem value="1">General Medicine</MenuItem>
            <MenuItem value="2">Pediatrics</MenuItem>
            <MenuItem value="3">Surgery</MenuItem>
          </Select>
        </FormControl>
      </Paper>

      {/* Queue Table */}
      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow sx={{ backgroundColor: 'primary.main' }}>
              <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>#</TableCell>
              <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>Patient</TableCell>
              <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>UHID</TableCell>
              <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>Clinic</TableCell>
              <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>Wait Time</TableCell>
              <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>Status</TableCell>
              <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} align="center">
                  <CircularProgress />
                </TableCell>
              </TableRow>
            ) : queue.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} align="center">
                  <Typography variant="body1" color="text.secondary" sx={{ py: 4 }}>
                    No patients in queue
                  </Typography>
                </TableCell>
              </TableRow>
            ) : (
              queue.map((entry, index) => (
                <TableRow 
                  key={entry.id}
                  sx={{
                    backgroundColor: entry.isEmergency ? 'error.light' : 'inherit'
                  }}
                >
                  <TableCell>{index + 1}</TableCell>
                  <TableCell>
                    <Typography fontWeight={entry.isEmergency ? 'bold' : 'normal'}>
                      {entry.patientName || 'Unknown'}
                      {entry.isEmergency && <WarningIcon color="error" sx={{ ml: 1, verticalAlign: 'middle' }} />}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Chip label={entry.uhid || 'N/A'} size="small" />
                  </TableCell>
                  <TableCell>{entry.clinicName || '-'}</TableCell>
                  <TableCell>
                    <Typography
                      fontWeight="bold"
                      color={getWaitTimeColor(entry.waitingMinutes || 0)}
                    >
                      {entry.waitingMinutes || 0} min
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={entry.status}
                      color={getStatusColor(entry.status)}
                      size="small"
                      icon={entry.status === 'completed' ? <CheckCircleIcon /> : undefined}
                    />
                  </TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', gap: 1 }}>
                      <Button size="small" variant="outlined">
                        Call
                      </Button>
                      <Button size="small" variant="contained">
                        Start
                      </Button>
                    </Box>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Legend */}
      <Paper sx={{ p: 2, mt: 3 }}>
        <Typography variant="subtitle2" gutterBottom>
          Legend:
        </Typography>
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
          <Chip label="Waiting" color="warning" size="small" />
          <Chip label="Called" color="info" size="small" />
          <Chip label="In Service" color="primary" size="small" />
          <Chip label="Completed" color="success" size="small" icon={<CheckCircleIcon />} />
        </Box>
      </Paper>
    </Container>
  );
};

export default QueueManagementPage;
