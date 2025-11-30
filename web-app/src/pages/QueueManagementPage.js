import React, { useState, useEffect } from 'react';
import {
  Container,
  Paper,
  Typography,
  Box,
  Tabs,
  Tab,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Tooltip,
  Button,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Grid,
  Card,
  CardContent,
  CircularProgress,
  Stack
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';
import PersonIcon from '@mui/icons-material/Person';
import LocalHospitalIcon from '@mui/icons-material/LocalHospital';
import WarningIcon from '@mui/icons-material/Warning';
import ScienceIcon from '@mui/icons-material/Science';
import CallIcon from '@mui/icons-material/Call';
import AppLayout from '../components/layout/AppLayout';

const QueueManagementPage = () => {
  const [selectedClinic, setSelectedClinic] = useState('');
  const [clinics, setClinics] = useState([]);
  const [queue, setQueue] = useState([]);
  const [statistics, setStatistics] = useState(null);
  const [loading, setLoading] = useState(false);
  const [selectedTab, setSelectedTab] = useState(0);

  // Fetch clinics on mount
  useEffect(() => {
    fetchClinics();
  }, []);

  // Fetch queue when clinic selected
  useEffect(() => {
    if (selectedClinic) {
      fetchQueue();
      fetchStatistics();
      // Auto-refresh every 30 seconds
      const interval = setInterval(() => {
        fetchQueue();
        fetchStatistics();
      }, 30000);
      return () => clearInterval(interval);
    }
  }, [selectedClinic]);

  const fetchClinics = async () => {
    try {
      const response = await fetch('http://localhost:3001/api/clinics', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token') || 'dev-token'}` }
      });
      if (response.ok) {
        const data = await response.json();
        setClinics(data.data || []);
        if (data.data?.length > 0) {
          setSelectedClinic(data.data[0].id);
        }
      }
    } catch (error) {
      console.error('Error fetching clinics:', error);
    }
  };

  const fetchQueue = async () => {
    if (!selectedClinic) return;
    setLoading(true);
    try {
      const response = await fetch(`http://localhost:3001/api/queue/clinic/${selectedClinic}`, {
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
    if (!selectedClinic) return;
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

  const updateQueueStatus = async (queueId, newStatus) => {
    try {
      const response = await fetch(`http://localhost:3001/api/queue/${queueId}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token') || 'dev-token'}`
        },
        body: JSON.stringify({ status: newStatus })
      });
      if (response.ok) {
        fetchQueue();
        fetchStatistics();
      }
    } catch (error) {
      console.error('Error updating queue status:', error);
    }
  };

  const getStatusColor = (status) => {
    const colors = {
      'waiting': 'warning',
      'called': 'info',
      'in-service': 'primary',
      'completed': 'success',
      'no-show': 'error',
      'cancelled': 'default'
    };
    return colors[status] || 'default';
  };

  const getWaitTimeColor = (minutes) => {
    if (minutes < 15) return 'success.main';
    if (minutes < 30) return 'warning.main';
    if (minutes < 60) return 'orange';
    return 'error.main';
  };

  const calculateWaitTime = (joinedAt) => {
    const now = new Date();
    const joined = new Date(joinedAt);
    return Math.floor((now - joined) / 60000); // minutes
  };

  return (
    <AppLayout>
      <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
        {/* Header */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
          <Typography variant="h4" component="h1" fontWeight="bold">
            🏥 Queue Management
          </Typography>
          <Button
            startIcon={<RefreshIcon />}
            onClick={() => { fetchQueue(); fetchStatistics(); }}
            disabled={loading}
          >
            Refresh
          </Button>
        </Box>

        {/* Statistics Cards */}
        {statistics && (
          <Grid container spacing={2} sx={{ mb: 3 }}>
            <Grid item xs={12} sm={6} md={3}>
              <Card>
                <CardContent>
                  <Typography color="text.secondary" gutterBottom variant="body2">
                    Total in Queue
                  </Typography>
                  <Typography variant="h3" component="div" color="primary">
                    {statistics.totalInQueue}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Card>
                <CardContent>
                  <Typography color="text.secondary" gutterBottom variant="body2">
                    Emergencies
                  </Typography>
                  <Typography variant="h3" component="div" color="error">
                    {statistics.emergencies}
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
                  <Typography variant="h3" component="div">
                    {statistics.averageWaitMinutes} min
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Card>
                <CardContent>
                  <Typography color="text.secondary" gutterBottom variant="body2">
                    Longest Wait
                  </Typography>
                  <Typography variant="h3" component="div" color="warning.main">
                    {statistics.longestWaitMinutes} min
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        )}

        {/* Filters */}
        <Paper sx={{ p: 2, mb: 3 }}>
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={12} md={6}>
              <FormControl fullWidth>
                <InputLabel>Clinic</InputLabel>
                <Select
                  value={selectedClinic}
                  label="Clinic"
                  onChange={(e) => setSelectedClinic(e.target.value)}
                >
                  {clinics.map((clinic) => (
                    <MenuItem key={clinic.id} value={clinic.id}>
                      {clinic.clinic_name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} md={6}>
              <Stack direction="row" spacing={1}>
                <Chip label="All" color="primary" onClick={() => setSelectedTab(0)} />
                <Chip label="Waiting" onClick={() => setSelectedTab(0)} />
                <Chip label="Emergencies" color="error" />
              </Stack>
            </Grid>
          </Grid>
        </Paper>

        {/* Queue Table */}
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow sx={{ backgroundColor: 'primary.main' }}>
                <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>#</TableCell>
                <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>Patient</TableCell>
                <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>UHID</TableCell>
                <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>Payment</TableCell>
                <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>Doctor</TableCell>
                <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>Wait Time</TableCell>
                <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>Status</TableCell>
                <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={8} align="center">
                    <CircularProgress />
                  </TableCell>
                </TableRow>
              ) : queue.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} align="center">
                    <Typography variant="body1" color="text.secondary" sx={{ py: 4 }}>
                      No patients in queue
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                queue.map((entry, index) => {
                  const waitMinutes = calculateWaitTime(entry.joined_at);
                  return (
                    <TableRow 
                      key={entry.id}
                      sx={{
                        backgroundColor: entry.is_emergency ? 'error.light' : 'inherit',
                        '&:hover': { backgroundColor: 'action.hover' }
                      }}
                    >
                      <TableCell>
                        <Typography variant="h6">{entry.queue_position || index + 1}</Typography>
                      </TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <PersonIcon color="primary" />
                          <Box>
                            <Typography variant="body1" fontWeight="medium">
                              {entry.patient?.first_name} {entry.patient?.last_name}
                            </Typography>
                            {entry.is_emergency && (
                              <Chip label="EMERGENCY" size="small" color="error" icon={<WarningIcon />} />
                            )}
                          </Box>
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Chip label={entry.patient?.uhid || 'N/A'} size="small" />
                      </TableCell>
                      <TableCell>
                        <Chip label={entry.encounter?.payment_type || 'self-pay'} size="small" variant="outlined" />
                      </TableCell>
                      <TableCell>
                        {entry.doctor ? `Dr. ${entry.doctor.last_name}` : 'Unassigned'}
                      </TableCell>
                      <TableCell>
                        <Typography 
                          variant="body1" 
                          fontWeight="bold"
                          sx={{ color: getWaitTimeColor(waitMinutes) }}
                        >
                          {waitMinutes} min
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Chip 
                          label={entry.status} 
                          color={getStatusColor(entry.status)}
                          size="small"
                        />
                      </TableCell>
                      <TableCell>
                        <Stack direction="row" spacing={1}>
                          {entry.status === 'waiting' && (
                            <Tooltip title="Call Patient">
                              <IconButton 
                                size="small" 
                                color="primary"
                                onClick={() => updateQueueStatus(entry.id, 'called')}
                              >
                                <CallIcon />
                              </IconButton>
                            </Tooltip>
                          )}
                          {entry.status === 'called' && (
                            <Button 
                              size="small" 
                              variant="contained"
                              onClick={() => updateQueueStatus(entry.id, 'in-service')}
                            >
                              Start
                            </Button>
                          )}
                          {entry.status === 'in-service' && (
                            <Button 
                              size="small" 
                              variant="contained" 
                              color="success"
                              onClick={() => updateQueueStatus(entry.id, 'completed')}
                            >
                              Complete
                            </Button>
                          )}
                        </Stack>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </TableContainer>

        {/* Legend */}
        <Paper sx={{ p: 2, mt: 2 }}>
          <Typography variant="subtitle2" gutterBottom>
            Queue Status Legend:
          </Typography>
          <Stack direction="row" spacing={2} flexWrap="wrap">
            <Chip label="Waiting" color="warning" size="small" />
            <Chip label="Called" color="info" size="small" />
            <Chip label="In Service" color="primary" size="small" />
            <Chip label="Completed" color="success" size="small" />
            <Typography variant="caption" color="text.secondary" sx={{ ml: 2 }}>
              Wait Time: <span style={{ color: '#4caf50' }}>Green (&lt;15min)</span> | 
              <span style={{ color: '#ff9800' }}> Yellow (15-30min)</span> | 
              <span style={{ color: '#f44336' }}> Red (&gt;60min)</span>
            </Typography>
          </Stack>
        </Paper>
      </Container>
    </AppLayout>
  );
};

export default QueueManagementPage;

