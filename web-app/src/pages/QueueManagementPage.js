import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import io from 'socket.io-client';
import {
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
  Alert,
  LinearProgress,
  Fade,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  RadioGroup,
  FormControlLabel,
  Radio,
  FormLabel
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import FiberManualRecordIcon from '@mui/icons-material/FiberManualRecord';
import WarningIcon from '@mui/icons-material/Warning';
import TrendSparkline from '../components/common/TrendSparkline';
import StatusPill from '../components/common/StatusPill';
import PriorityBadge from '../components/common/PriorityBadge';
import ProgressStat from '../components/common/ProgressStat';
import AddPatientToQueueDialog from '../components/queue/AddPatientToQueueDialog';
import ConsultationForm from '../components/consultation/ConsultationForm';
import { useNotification } from '../contexts/NotificationContext';
import API_CONFIG from '../config/api';
import { useLocation, useNavigate } from '../routerCompat';
import {
  DEPARTMENT_WORKSPACES,
  getQueueType,
  getRequestedQueueType,
  requiresDepartmentCompletion,
} from '../utils/workflowRouting';

const QueueManagementPage = () => {
  const location = useLocation();
  const requestedQueueType = getRequestedQueueType(location.state);
  const [queue, setQueue] = useState([]);
  const [statistics, setStatistics] = useState(null);
  const [clinics, setClinics] = useState([]);
  const [selectedClinic, setSelectedClinic] = useState('all');
  const [selectedQueueType, setSelectedQueueType] = useState(requestedQueueType);
  const [loading, setLoading] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);
  const [completeDialogOpen, setCompleteDialogOpen] = useState(false);
  const [addPatientDialogOpen, setAddPatientDialogOpen] = useState(false);
  const [consultationFormOpen, setConsultationFormOpen] = useState(false);
  const [selectedQueueEntry, setSelectedQueueEntry] = useState(null);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [selectedEncounter, setSelectedEncounter] = useState(null);
  const [nextQueue, setNextQueue] = useState('discharge');
  const socketRef = useRef(null);
  const joinedClinicRef = useRef(null);
  const fetchQueueRef = useRef(null);
  const fetchStatisticsRef = useRef(null);
  const queueFiltersRef = useRef({ selectedClinic, selectedQueueType });
  const { notifySuccess, notifyError, notifyWarning } = useNotification();
  const navigate = useNavigate();

  queueFiltersRef.current = { selectedClinic, selectedQueueType };

  useEffect(() => {
    // Initialize WebSocket connection
    const socket = io(API_CONFIG.wsURL, {
      transports: ['websocket', 'polling'],
      withCredentials: true
    });

    socket.on('connect', () => {
      console.log('WebSocket connected');
      setWsConnected(true);

      // Join queue room for selected clinic
      const currentClinic = queueFiltersRef.current.selectedClinic;
      if (currentClinic !== 'all') {
        socket.emit('join-queue', { clinicId: currentClinic });
        joinedClinicRef.current = currentClinic;
      }
    });

    socket.on('disconnect', () => {
      console.log('WebSocket disconnected');
      setWsConnected(false);
    });

    socket.on('queue-update', () => {
      // Refresh queue data when update is received
      const filters = queueFiltersRef.current;
      fetchQueueRef.current?.({
        silent: true,
        showSpinner: false,
        clinic: filters.selectedClinic,
        queueType: filters.selectedQueueType,
      });
    });

    socketRef.current = socket;

    return () => {
      if (joinedClinicRef.current) {
        socket.emit('leave-queue', { clinicId: joinedClinicRef.current });
        joinedClinicRef.current = null;
      }
      socket.disconnect();
    };
  }, []);

  // Fetch clinics dynamically on mount
  useEffect(() => {
    const fetchClinics = async () => {
      try {
        const response = await fetch(`${API_CONFIG.endpoints.clinics}`, {
          headers: API_CONFIG.getAuthHeaders()
        });
        if (response.ok) {
          const data = await response.json();
          setClinics(data.data || []);
        }
      } catch (error) {
        console.error('Error fetching clinics:', error);
      }
    };
    fetchClinics();
  }, []);

  useEffect(() => {
    // Join/leave queue rooms when clinic changes
    if (socketRef.current && socketRef.current.connected) {
      if (joinedClinicRef.current && joinedClinicRef.current !== selectedClinic) {
        socketRef.current.emit('leave-queue', { clinicId: joinedClinicRef.current });
        joinedClinicRef.current = null;
      }
      if (selectedClinic !== 'all') {
        socketRef.current.emit('join-queue', { clinicId: selectedClinic });
        joinedClinicRef.current = selectedClinic;
      }
    }
  }, [selectedClinic]);

  useEffect(() => {
    fetchQueueRef.current?.({ silent: true });
    fetchStatisticsRef.current?.({ silent: true });

    // Auto-refresh every 30 seconds as backup
    const interval = setInterval(() => {
      if (!wsConnected) {
        fetchQueueRef.current?.({ silent: true, showSpinner: false });
        fetchStatisticsRef.current?.({ silent: true });
      }
    }, 30000);

    // Update waiting times every 10 seconds for live timer
    const timerInterval = setInterval(() => {
      fetchQueueRef.current?.({ silent: true, showSpinner: false });
    }, 10000);

    return () => {
      clearInterval(interval);
      clearInterval(timerInterval);
    };
  }, [selectedClinic, selectedQueueType, wsConnected]);

  const fetchQueue = useCallback(async ({
    silent = true,
    showSpinner = true,
    clinic = selectedClinic,
    queueType = selectedQueueType,
  } = {}) => {
    if (showSpinner) {
      setLoading(true);
    }
    try {
      let endpoint = clinic === 'all'
        ? `${API_CONFIG.endpoints.queue}`
        : `${API_CONFIG.endpoints.queue}/clinic/${clinic}`;
      
      // Add queue type filter
      endpoint += `?queueType=${encodeURIComponent(queueType)}`;

      const response = await fetch(endpoint, {
        headers: API_CONFIG.getAuthHeaders()
      });

      if (response.ok) {
        const data = await response.json();
        // Transform snake_case to camelCase for frontend
        const transformedQueue = (data.data || []).map(entry => ({
          ...entry,
          patientName: entry.patient_name || `${entry.first_name || ''} ${entry.last_name || ''}`.trim(),
          clinicName: entry.clinic_name,
          waitingMinutes: Math.round(entry.waiting_minutes || 0),
          isEmergency: entry.is_emergency,
          priorityLevel: entry.priority_level,
          queueType: entry.queue_type
        }));
        setQueue(transformedQueue);
        if (!silent) {
          notifySuccess('Queue updated');
        }
      }
    } catch (error) {
      console.error('Error fetching queue:', error);
      if (!silent) {
        notifyError('Unable to load queue');
      }
    } finally {
      if (showSpinner) {
        setLoading(false);
      }
    }
  }, [notifyError, notifySuccess, selectedClinic, selectedQueueType]);

  const fetchStatistics = useCallback(async ({ silent = true } = {}) => {
    try {
      const statisticsEndpoint = selectedClinic === 'all'
        ? `${API_CONFIG.endpoints.queue}/statistics`
        : `${API_CONFIG.endpoints.queue}/clinic/${selectedClinic}/statistics`;
      const response = await fetch(
        `${statisticsEndpoint}?queueType=${encodeURIComponent(selectedQueueType)}`,
        {
          headers: API_CONFIG.getAuthHeaders()
        }
      );

      if (response.ok) {
        const data = await response.json();
        setStatistics(data.data);
      } else {
        setStatistics(null);
      }
    } catch (error) {
      setStatistics(null);
      console.error('Error fetching statistics:', error);
      if (!silent) {
        notifyError('Unable to load queue insights');
      }
    }
  }, [notifyError, selectedClinic, selectedQueueType]);

  fetchQueueRef.current = fetchQueue;
  fetchStatisticsRef.current = fetchStatistics;

  const handleRefresh = () => {
    fetchQueue({ silent: false });
    fetchStatistics({ silent: true });
  };

  const handleCallPatient = async (queueEntryId) => {
    try {
      const response = await fetch(`${API_CONFIG.baseURL}/api/queue/${queueEntryId}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...API_CONFIG.getAuthHeaders()
        },
        body: JSON.stringify({ status: 'called' })
      });

      if (response.ok) {
        fetchQueue({ silent: true });
        notifySuccess('Patient called');
      }
    } catch (error) {
      console.error('Error calling patient:', error);
      notifyError('Failed to call patient');
    }
  };

  const handleStartService = async (queueEntry) => {
    // For consultation queue, open the consultation form
    if (selectedQueueType === 'consultation' || queueEntry.queueType === 'consultation' || queueEntry.queue_type === 'consultation') {
      // Fetch patient and encounter details
      try {
        const [patientRes, encounterRes] = await Promise.all([
          fetch(`${API_CONFIG.endpoints.patients}/${queueEntry.patientId || queueEntry.patient_id}`, {
            headers: API_CONFIG.getAuthHeaders()
          }),
          fetch(`${API_CONFIG.endpoints.encounters}/${queueEntry.encounterId || queueEntry.encounter_id}`, {
            headers: API_CONFIG.getAuthHeaders()
          })
        ]);

        if (patientRes.ok && encounterRes.ok) {
          const patientData = await patientRes.json();
          const encounterData = await encounterRes.json();
          
          setSelectedPatient(patientData.data);
          setSelectedEncounter(encounterData.data);
          setSelectedQueueEntry(queueEntry);
          setConsultationFormOpen(true);

          // Update queue status to in-service
          await fetch(`${API_CONFIG.baseURL}/api/queue/${queueEntry.id}/status`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              ...API_CONFIG.getAuthHeaders()
            },
            body: JSON.stringify({ status: 'in-service' })
          });

          fetchQueue({ silent: true });
        }
      } catch (error) {
        console.error('Error fetching patient/encounter:', error);
        notifyError('Failed to load patient details');
      }
    } else {
      // For other queues, just update status
      try {
        const response = await fetch(`${API_CONFIG.baseURL}/api/queue/${queueEntry.id}/status`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            ...API_CONFIG.getAuthHeaders()
          },
          body: JSON.stringify({ status: 'in-service' })
        });

        if (response.ok) {
          fetchQueue({ silent: true });
          const queueType = getQueueType(queueEntry);
          notifySuccess('Service started — opening the department workspace');
          if (DEPARTMENT_WORKSPACES[queueType]) {
            navigate(DEPARTMENT_WORKSPACES[queueType], {
              state: {
                encounterId: queueEntry.encounterId || queueEntry.encounter_id,
                patientId: queueEntry.patientId || queueEntry.patient_id
              }
            });
          }
        }
      } catch (error) {
        console.error('Error starting service:', error);
        notifyError('Failed to start service');
      }
    }
  };

  const handleOpenCompleteDialog = (queueEntry) => {
    const queueType = getQueueType(queueEntry);
    if (requiresDepartmentCompletion(queueEntry)) {
      notifyWarning(`Complete this service in the ${queueType} workspace after its clinical work is recorded.`);
      if (DEPARTMENT_WORKSPACES[queueType]) navigate(DEPARTMENT_WORKSPACES[queueType]);
      return;
    }

    if (queueType === 'consultation') {
      notifyWarning('Complete the clinical record in the consultation form.');
      handleStartService(queueEntry);
      return;
    }

    setSelectedQueueEntry(queueEntry);
    
    // Smart default based on current queue type
    // Consultation can go anywhere, other queues default to billing
    if (queueEntry.queueType === 'consultation' || queueEntry.queue_type === 'consultation') {
      setNextQueue('billing'); // Most common path
    } else {
      setNextQueue('billing'); // Lab/Pharmacy/Radiology → Billing
    }
    
    setNextQueue(queueType === 'triage' ? 'consultation' : 'discharge');
    setCompleteDialogOpen(true);
  };

  const handleCloseCompleteDialog = () => {
    setCompleteDialogOpen(false);
    setSelectedQueueEntry(null);
    setNextQueue('discharge');
  };

  const handleCompleteService = async () => {
    if (!selectedQueueEntry) return;

    if (requiresDepartmentCompletion(selectedQueueEntry)) {
      const queueType = getQueueType(selectedQueueEntry);
      notifyWarning(`The ${queueType} queue closes automatically when its order is completed.`);
      handleCloseCompleteDialog();
      return;
    }
    
    try {
      const response = await fetch(`${API_CONFIG.baseURL}/api/queue/${selectedQueueEntry.id}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...API_CONFIG.getAuthHeaders()
        },
        body: JSON.stringify({ 
          status: 'completed',
          nextQueue: nextQueue === 'discharge' ? null : nextQueue
        })
      });

      if (response.ok) {
        const result = await response.json();
        fetchQueue({ silent: true });
        handleCloseCompleteDialog();
        notifySuccess(result.message || `Service completed. Patient moved to ${nextQueue || 'discharge'}`);
      } else {
        const error = await response.json();
        console.error('Failed to complete service:', error);
        notifyError(error.error || 'Failed to complete service');
      }
    } catch (error) {
      console.error('Error completing service:', error);
      notifyError('Failed to complete service: ' + error.message);
    }
  };

  const getWaitTimeColor = (minutes) => {
    if (minutes < 15) return 'success.main';
    if (minutes < 30) return 'warning.main';
    return 'error.main';
  };

  const getWaitTimeVariant = (minutes) => {
    if (minutes < 15) return 'success';
    if (minutes < 30) return 'warning';
    return 'error';
  };

  const derivedStats = useMemo(() => {
    const waitingCount = queue.filter((entry) => entry.status === 'waiting').length;
    const inServiceCount = queue.filter((entry) => entry.status === 'in-service').length;
    const completedCount = queue.filter((entry) => entry.status === 'completed').length;
    const averageWait = queue.length
      ? Math.round(
          queue.reduce((sum, entry) => sum + (entry.waitingMinutes || 0), 0) / queue.length
        )
      : 0;

    return {
      totalWaiting: statistics?.totalWaiting ?? (queue.length ? waitingCount || queue.length : 0),
      inService: statistics?.inService ?? inServiceCount,
      averageWaitTime: statistics?.averageWaitTime ?? averageWait,
      completedToday: statistics?.completedToday ?? completedCount,
    };
  }, [statistics, queue]);

  const queueTrendData = useMemo(() => {
    if (!queue.length) return [];
    return queue.slice(0, 8).map((entry, idx) => ({
      label: entry.patientName?.split(' ')[0] || `P${idx + 1}`,
      value: entry.waitingMinutes || 0,
    }));
  }, [queue]);

  const emergencyCount = useMemo(
    () =>
      queue.filter((entry) =>
        ['emergency', 'stat'].includes((entry.priority || '').toLowerCase())
      ).length,
    [queue]
  );

  const serviceUtilization = queue.length
    ? Math.round((derivedStats.inService / queue.length) * 100)
    : 0;
  const averageWaitPercent = Math.min(100, (derivedStats.averageWaitTime / 60) * 100);
  const emergencyLoad = queue.length ? Math.round((emergencyCount / queue.length) * 100) : 0;

  const statCards = useMemo(
    () => [
      {
        title: 'Total Waiting',
        value: derivedStats.totalWaiting || 0,
        subtitle: `${queue.length} patients in scope`,
        color: 'warning.main',
        data: queueTrendData,
      },
      {
        title: 'In Service',
        value: derivedStats.inService || 0,
        subtitle: 'Actively being attended',
        color: 'primary.main',
        data: queueTrendData,
      },
      {
        title: 'Avg Wait Time',
        value: `${derivedStats.averageWaitTime || 0} min`,
        subtitle: 'Target &lt; 20 mins',
        color: 'info.main',
        data: queueTrendData,
      },
      {
        title: 'Completed Today',
        value: derivedStats.completedToday || 0,
        subtitle: 'Visits closed today',
        color: 'success.main',
        data: queueTrendData,
      },
    ],
    [derivedStats, queue.length, queueTrendData]
  );

  return (
    <Box component="section" sx={{ width: '100%', minWidth: 0, mb: 3 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Typography variant="h4" component="h1" fontWeight="bold">
            Queue Management
          </Typography>
          <Chip
            icon={wsConnected ? <FiberManualRecordIcon /> : <WarningIcon />}
            label={wsConnected ? 'Live' : 'Polling'}
            color={wsConnected ? 'success' : 'warning'}
            size="small"
          />
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            variant="outlined"
            onClick={() => setAddPatientDialogOpen(true)}
          >
            + Add Patient
          </Button>
          <Button
            startIcon={<RefreshIcon />}
            onClick={handleRefresh}
            disabled={loading}
          >
            Refresh
          </Button>
        </Box>
      </Box>

      {/* WebSocket Status Alert */}
      {!wsConnected && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Real-time updates unavailable. Using 30-second polling instead.
        </Alert>
      )}

      <Fade in>
        <Grid container spacing={2} sx={{ mb: 3 }}>
          {statCards.map((card, index) => (
            <Grid item xs={12} sm={6} md={3} key={`${card.title}-${index}`}>
              <Card sx={{ height: '100%' }}>
                <CardContent>
                  <Typography color="text.secondary" gutterBottom variant="body2">
                    {card.title}
                  </Typography>
                  <Typography variant="h4" component="div" sx={{ color: card.color }} fontWeight={700}>
                    {card.value}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                    {card.subtitle}
                  </Typography>
                  <Box sx={{ mt: 2 }}>
                    <TrendSparkline data={card.data} />
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      </Fade>

      {/* Filters */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Grid container spacing={2}>
          <Grid item xs={12} md={6}>
            <FormControl fullWidth>
              <InputLabel>Queue Type</InputLabel>
              <Select
                value={selectedQueueType}
                label="Queue Type"
                onChange={(e) => setSelectedQueueType(e.target.value)}
              >
                <MenuItem value="consultation">Consultation</MenuItem>
                <MenuItem value="pharmacy">Pharmacy</MenuItem>
                <MenuItem value="lab">Laboratory</MenuItem>
                <MenuItem value="radiology">Radiology</MenuItem>
                <MenuItem value="billing">Billing</MenuItem>
                <MenuItem value="triage">Triage</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} md={6}>
            <FormControl fullWidth>
              <InputLabel>Clinic</InputLabel>
              <Select
                value={selectedClinic}
                label="Clinic"
                onChange={(e) => setSelectedClinic(e.target.value)}
              >
                <MenuItem value="all">All Clinics</MenuItem>
                {clinics.map((clinic) => (
                  <MenuItem key={clinic.id} value={String(clinic.id)}>
                    {clinic.clinic_name || clinic.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
        </Grid>
      </Paper>

      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3, height: '100%' }}>
            <Typography variant="h6" gutterBottom>
              Queue Health
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <ProgressStat
                label="Service Utilization"
                value={serviceUtilization}
                color="primary"
                helperText={`${derivedStats.inService || 0} rooms in use`}
              />
              <ProgressStat
                label="Average Wait SLA"
                value={averageWaitPercent}
                color="warning"
                helperText={`${derivedStats.averageWaitTime || 0} minutes avg`}
              />
              <ProgressStat
                label="Emergency Load"
                value={emergencyLoad}
                color="error"
                helperText={`${emergencyCount} critical cases`}
              />
            </Box>
          </Paper>
        </Grid>
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3, height: '100%' }}>
            <Typography variant="h6" gutterBottom>
              Wait Time Trend
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Live sparkline of the last 8 patients in queue
            </Typography>
            <TrendSparkline data={queueTrendData} height={180} />
          </Paper>
        </Grid>
      </Grid>

      {/* Queue Table */}
      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>#</TableCell>
              <TableCell>Patient</TableCell>
              <TableCell>UHID</TableCell>
              <TableCell>Clinic</TableCell>
              <TableCell>Priority</TableCell>
              <TableCell>Wait Time</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Actions</TableCell>
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
                    <PriorityBadge
                      priority={entry.priority || (entry.isEmergency ? 'emergency' : 'routine')}
                      size="small"
                    />
                  </TableCell>
                  <TableCell>
                    <Typography
                      fontWeight="bold"
                      color={getWaitTimeColor(entry.waitingMinutes || 0)}
                    >
                      {entry.waitingMinutes || 0} min
                    </Typography>
                    <Tooltip title="Target &lt; 30 min" placement="top">
                      <LinearProgress
                        variant="determinate"
                        value={Math.min(100, ((entry.waitingMinutes || 0) / 60) * 100)}
                        color={getWaitTimeVariant(entry.waitingMinutes || 0)}
                        sx={{ mt: 1, height: 6, borderRadius: 999 }}
                      />
                    </Tooltip>
                  </TableCell>
                  <TableCell>
                    <StatusPill status={entry.status} size="small" />
                  </TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', gap: 1 }}>
                      {entry.status === 'waiting' && (
                        <Button 
                          size="small" 
                          variant="outlined"
                          onClick={() => handleCallPatient(entry.id)}
                        >
                          Call
                        </Button>
                      )}
                      {(entry.status === 'waiting' || entry.status === 'called') && (
                        <Button 
                          size="small" 
                          variant="contained"
                          onClick={() => handleStartService(entry)}
                        >
                          Start
                        </Button>
                      )}
                      {entry.status === 'in-service' && (
                        requiresDepartmentCompletion(entry) ? (
                          <Button
                            size="small"
                            variant="outlined"
                            onClick={() => navigate(DEPARTMENT_WORKSPACES[getQueueType(entry)])}
                          >
                            Open workspace
                          </Button>
                        ) : (
                          <Button
                            size="small"
                            variant="contained"
                            color="success"
                            onClick={() => handleOpenCompleteDialog(entry)}
                          >
                            Complete
                          </Button>
                        )
                      )}
                    </Box>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Legend */}
      <Paper sx={{ p: 2, mt: 2 }}>
        <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
          Legend
        </Typography>
        <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'center' }}>
          <StatusPill status="waiting" size="small" />
          <StatusPill status="called" size="small" />
          <StatusPill status="in-service" size="small" />
          <StatusPill status="completed" size="small" />
          <Box sx={{ width: 1, height: 16, backgroundColor: 'divider' }} />
          <PriorityBadge priority="routine" />
          <PriorityBadge priority="urgent" />
          <PriorityBadge priority="stat" />
        </Box>
      </Paper>

      {/* Complete Service Dialog - Hospital Workflow (Queue-Type Aware) */}
      <Dialog open={completeDialogOpen} onClose={handleCloseCompleteDialog} maxWidth="sm" fullWidth>
        <DialogTitle>
          Complete {selectedQueueEntry?.queueType || selectedQueueEntry?.queue_type || 'Service'} - Next Step
        </DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 2 }}>
            <Alert severity="info" sx={{ mb: 3 }}>
              {getQueueType(selectedQueueEntry) === 'triage'
                ? 'Completing triage sends the patient to consultation.'
                : 'Complete the current service in its clinical workspace.'}
            </Alert>
            
            {selectedQueueEntry && (
              <Box sx={{ mb: 3, p: 2, bgcolor: 'primary.light', borderRadius: 1 }}>
                <Typography variant="body2" color="text.secondary">
                  <strong>Patient:</strong> {selectedQueueEntry.patientName || selectedQueueEntry.patient_name}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  <strong>UHID:</strong> {selectedQueueEntry.uhid}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  <strong>Current Queue:</strong> {selectedQueueEntry.queueType || selectedQueueEntry.queue_type}
                </Typography>
              </Box>
            )}

            <FormControl component="fieldset" fullWidth>
              <FormLabel component="legend">Next Destination</FormLabel>
              <RadioGroup
                value={nextQueue}
                onChange={(e) => setNextQueue(e.target.value)}
              >
                {getQueueType(selectedQueueEntry) === 'triage' && (
                  <FormControlLabel
                    value="consultation"
                    control={<Radio />}
                    label="Consultation — clinician review"
                  />
                )}
                {(selectedQueueEntry?.queueType === 'consultation' || selectedQueueEntry?.queue_type === 'consultation') && (
                  <>
                    <FormControlLabel 
                      value="pharmacy" 
                      control={<Radio />} 
                      label="Pharmacy — Patient needs medication"
                    />
                    <FormControlLabel 
                      value="lab" 
                      control={<Radio />} 
                      label="Laboratory — Patient needs lab tests"
                    />
                    <FormControlLabel 
                      value="radiology" 
                      control={<Radio />} 
                      label="Radiology — Patient needs imaging"
                    />
                  </>
                )}
                <FormControlLabel 
                  value="billing" 
                  control={<Radio />} 
                  disabled={getQueueType(selectedQueueEntry) === 'triage'}
                  label="Billing — Patient ready to pay and leave"
                />
                <FormControlLabel 
                  value="discharge" 
                  control={<Radio />} 
                  disabled={getQueueType(selectedQueueEntry) === 'triage'}
                  label="Discharge — Patient can leave (no further action)"
                />
              </RadioGroup>
            </FormControl>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseCompleteDialog}>Cancel</Button>
          <Button 
            onClick={handleCompleteService} 
            variant="contained" 
            color="success"
          >
            Complete & Move Patient
          </Button>
        </DialogActions>
      </Dialog>

      {/* Add Patient to Queue Dialog */}
      <AddPatientToQueueDialog
        open={addPatientDialogOpen}
        onClose={() => setAddPatientDialogOpen(false)}
        onSuccess={() => {
          fetchQueue({ silent: true });
        }}
      />

      {/* Consultation Form Dialog */}
      {consultationFormOpen && selectedPatient && selectedEncounter && (
        <ConsultationForm
          open={consultationFormOpen}
          onClose={() => {
            setConsultationFormOpen(false);
            setSelectedPatient(null);
            setSelectedEncounter(null);
            setSelectedQueueEntry(null);
          }}
          encounter={selectedEncounter}
          patient={selectedPatient}
          onSuccess={() => {
            fetchQueue({ silent: true });
            notifySuccess('Consultation completed! Patient added to service queues.');
          }}
        />
      )}
    </Box>
  );
};

export default QueueManagementPage;
