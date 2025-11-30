import React, { useState, useEffect, useMemo } from 'react';
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
  Grid,
  Card,
  CardContent,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
  ToggleButton,
  ToggleButtonGroup,
  Button,
  CircularProgress,
  Fade
} from '@mui/material';
import ViewListIcon from '@mui/icons-material/ViewList';
import ViewModuleIcon from '@mui/icons-material/ViewModule';
import RefreshIcon from '@mui/icons-material/Refresh';
import BedIcon from '@mui/icons-material/Bed';
import PersonIcon from '@mui/icons-material/Person';
import StatusPill from '../components/common/StatusPill';
import ProgressStat from '../components/common/ProgressStat';
import { useNotification } from '../contexts/NotificationContext';

const WardOccupancyPage = () => {
  const [selectedWard, setSelectedWard] = useState('');
  const [wards, setWards] = useState([]);
  const [occupancy, setOccupancy] = useState([]);
  const [statistics, setStatistics] = useState(null);
  const [viewMode, setViewMode] = useState('table');
  const [loading, setLoading] = useState(false);
  const { notifySuccess, notifyError } = useNotification();

  useEffect(() => {
    fetchWards();
  }, []);

  useEffect(() => {
    if (selectedWard) {
      fetchOccupancy();
      fetchStatistics();
    }
  }, [selectedWard]);

  const fetchWards = async () => {
    try {
      const response = await fetch('http://localhost:3001/api/wards', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token') || 'dev-token'}` }
      });
      if (response.ok) {
        const data = await response.json();
        setWards(data.data || []);
        if (data.data?.length > 0) {
          setSelectedWard(data.data[0].id);
        }
      }
    } catch (error) {
      console.error('Error fetching wards:', error);
      notifyError('Unable to load wards');
    }
  };

  const fetchOccupancy = async () => {
    if (!selectedWard) return;
    setLoading(true);
    try {
      const response = await fetch(`http://localhost:3001/api/wards/${selectedWard}/occupancy`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token') || 'dev-token'}` }
      });
      if (response.ok) {
        const data = await response.json();
        setOccupancy(data.data || []);
      }
    } catch (error) {
      console.error('Error fetching occupancy:', error);
      notifyError('Unable to load occupancy');
    } finally {
      setLoading(false);
    }
  };

  const fetchStatistics = async () => {
    if (!selectedWard) return;
    try {
      const response = await fetch(`http://localhost:3001/api/wards/${selectedWard}/statistics`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token') || 'dev-token'}` }
      });
      if (response.ok) {
        const data = await response.json();
        setStatistics(data.data);
      }
    } catch (error) {
      console.error('Error fetching statistics:', error);
      notifyError('Unable to load ward statistics');
    }
  };

  const handleRefresh = () => {
    fetchOccupancy();
    fetchStatistics();
    notifySuccess('Ward data refreshed');
  };

  const occupancyRate = useMemo(() => {
    if (!statistics) return 0;
    return Math.round(((statistics.occupied || 0) / (statistics.total_beds || 1)) * 100);
  }, [statistics]);

  const availabilityRate = useMemo(() => {
    if (!statistics) return 0;
    return Math.round(((statistics.available || 0) / (statistics.total_beds || 1)) * 100);
  }, [statistics]);

  const getBedStatusColor = (status) => {
    const colors = {
      'available': 'success',
      'occupied': 'primary',
      'reserved': 'warning',
      'maintenance': 'default',
      'cleaning': 'info'
    };
    return colors[status] || 'default';
  };

  return (
    <Container sx={{ mt: 4, mb: 4 }}>
        {/* Header */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
          <Typography variant="h4" component="h1" fontWeight="bold">
            🛏️ Ward Occupancy Board
          </Typography>
          <Box sx={{ display: 'flex', gap: 2 }}>
            <ToggleButtonGroup
              value={viewMode}
              exclusive
              onChange={(e, newMode) => newMode && setViewMode(newMode)}
              size="small"
            >
              <ToggleButton value="table">
                <ViewListIcon /> Table
              </ToggleButton>
              <ToggleButton value="visual">
                <ViewModuleIcon /> Visual
              </ToggleButton>
            </ToggleButtonGroup>
            <Button
              startIcon={<RefreshIcon />}
              onClick={handleRefresh}
              disabled={loading}
            >
              Refresh
            </Button>
          </Box>
        </Box>

      {/* Statistics Cards */}
      {statistics && (
        <>
          <Fade in>
            <Grid container spacing={2} sx={{ mb: 3 }}>
              <Grid item xs={12} sm={6} md={2.4}>
                <Card>
                  <CardContent>
                    <Typography color="text.secondary" gutterBottom variant="body2">
                      Total Beds
                    </Typography>
                    <Typography variant="h3" component="div">
                      {statistics.total_beds || 0}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
              <Grid item xs={12} sm={6} md={2.4}>
                <Card>
                  <CardContent>
                    <Typography color="text.secondary" gutterBottom variant="body2">
                      Occupied
                    </Typography>
                    <Typography variant="h3" component="div" color="error.main">
                      {statistics.occupied || 0}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
              <Grid item xs={12} sm={6} md={2.4}>
                <Card>
                  <CardContent>
                    <Typography color="text.secondary" gutterBottom variant="body2">
                      Available
                    </Typography>
                    <Typography variant="h3" component="div" color="success.main">
                      {statistics.available || 0}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
              <Grid item xs={12} sm={6} md={2.4}>
                <Card>
                  <CardContent>
                    <Typography color="text.secondary" gutterBottom variant="body2">
                      Isolation
                    </Typography>
                    <Typography variant="h3" component="div" color="warning.main">
                      {statistics.isolation || 0}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
              <Grid item xs={12} sm={6} md={2.4}>
                <Card>
                  <CardContent>
                    <Typography color="text.secondary" gutterBottom variant="body2">
                      Discharges Today
                    </Typography>
                    <Typography variant="h3" component="div" color="primary">
                      {statistics.discharges_today || 0}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
            </Grid>
          </Fade>
          <Grid container spacing={2} sx={{ mb: 3 }}>
            <Grid item xs={12} md={6}>
              <Paper sx={{ p: 3 }}>
                <Typography variant="h6" gutterBottom>
                  Occupancy Snapshot
                </Typography>
                <ProgressStat
                  label="Bed Occupancy"
                  value={occupancyRate}
                  color="error"
                  helperText={`${statistics.occupied || 0} / ${statistics.total_beds || 0} beds in use`}
                />
                <ProgressStat
                  label="Availability"
                  value={availabilityRate}
                  color="success"
                  helperText={`${statistics.available || 0} beds free`}
                />
              </Paper>
            </Grid>
            <Grid item xs={12} md={6}>
              <Paper sx={{ p: 3 }}>
                <Typography variant="h6" gutterBottom>
                  Daily Flow
                </Typography>
                <ProgressStat
                  label="Discharge Turnover"
                  value={Math.min(100, (statistics.discharges_today || 0) * 10)}
                  color="info"
                  helperText={`${statistics.discharges_today || 0} discharges today`}
                />
              </Paper>
            </Grid>
          </Grid>
        </>
      )}

        {/* Ward Selector */}
        <Paper sx={{ p: 2, mb: 3 }}>
          <FormControl fullWidth>
            <InputLabel>Ward</InputLabel>
            <Select
              value={selectedWard}
              label="Ward"
              onChange={(e) => setSelectedWard(e.target.value)}
            >
              {wards.map((ward) => (
                <MenuItem key={ward.id} value={ward.id}>
                  {ward.ward_name} ({ward.occupied_beds || 0}/{ward.total_beds} occupied)
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Paper>

        {/* Table View */}
        {viewMode === 'table' && (
          <TableContainer component={Paper}>
            <Table>
              <TableHead>
                <TableRow sx={{ backgroundColor: 'primary.main' }}>
                  <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>Bed</TableCell>
                  <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>Patient</TableCell>
                  <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>UHID</TableCell>
                  <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>Doctor</TableCell>
                  <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>Payment Type</TableCell>
                  <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>Admission Date</TableCell>
                  <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>Status</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={7} align="center">
                      <CircularProgress />
                    </TableCell>
                  </TableRow>
                ) : occupancy.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} align="center">
                      <Typography variant="body1" color="text.secondary" sx={{ py: 4 }}>
                        No beds in this ward
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  occupancy.map((bed) => (
                    <TableRow
                      key={bed.id}
                      sx={{
                        backgroundColor: bed.status === 'occupied' ? 'action.hover' : 'inherit'
                      }}
                    >
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <BedIcon color={bed.status === 'occupied' ? 'error' : 'success'} />
                          <Typography variant="body1" fontWeight="bold">
                            {bed.bed_number}
                          </Typography>
                        </Box>
                      </TableCell>
                      <TableCell>
                        {bed.first_name ? (
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <PersonIcon color="primary" />
                            <Typography>
                              {bed.first_name} {bed.last_name}
                            </Typography>
                          </Box>
                        ) : (
                          <Typography color="text.secondary">Empty</Typography>
                        )}
                      </TableCell>
                      <TableCell>
                        {bed.uhid ? (
                          <Chip label={bed.uhid} size="small" />
                        ) : '-'}
                      </TableCell>
                      <TableCell>
                        {bed.doctor_first_name ? (
                          `Dr. ${bed.doctor_last_name}`
                        ) : '-'}
                      </TableCell>
                      <TableCell>
                        {bed.payment_type ? (
                          <Chip label={bed.payment_type} size="small" variant="outlined" />
                        ) : '-'}
                      </TableCell>
                      <TableCell>
                        {bed.admission_date ? (
                          new Date(bed.admission_date).toLocaleDateString()
                        ) : '-'}
                      </TableCell>
                      <TableCell>
                        <StatusPill status={bed.status} size="small" />
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        )}

        {/* Visual Board View */}
        {viewMode === 'visual' && (
          <Grid container spacing={2}>
            {loading ? (
              <Grid item xs={12}>
                <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
                  <CircularProgress />
                </Box>
              </Grid>
            ) : occupancy.map((bed) => (
              <Grid item xs={12} sm={6} md={4} lg={3} key={bed.id}>
                <Card
                  sx={{
                    border: bed.status === 'occupied' ? '2px solid' : '1px solid',
                    borderColor: bed.status === 'occupied' ? 'error.main' : 'divider',
                    backgroundColor: bed.status === 'available' ? 'success.light' : 'background.paper'
                  }}
                >
                  <CardContent>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
                      <Typography variant="h6" fontWeight="bold">
                        {bed.bed_number}
                      </Typography>
                      <StatusPill status={bed.status} size="small" />
                    </Box>

                    {bed.first_name ? (
                      <>
                        <Typography variant="body1" fontWeight="medium" gutterBottom>
                          {bed.first_name} {bed.last_name}
                        </Typography>
                        <Typography variant="caption" display="block" color="text.secondary">
                          UHID: {bed.uhid}
                        </Typography>
                        {bed.doctor_last_name && (
                          <Typography variant="caption" display="block" color="text.secondary">
                            Dr. {bed.doctor_last_name}
                          </Typography>
                        )}
                        <Chip
                          label={bed.payment_type}
                          size="small"
                          sx={{ mt: 1 }}
                        />
                      </>
                    ) : (
                      <Typography color="text.secondary" variant="body2">
                        Bed Available
                      </Typography>
                    )}
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        )}

        {/* Legend */}
        <Paper sx={{ p: 2, mt: 3 }}>
          <Typography variant="subtitle2" gutterBottom>
            Bed Status Legend:
          </Typography>
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
            <Chip label="Available" color="success" size="small" />
            <Chip label="Occupied" color="primary" size="small" />
            <Chip label="Reserved" color="warning" size="small" />
            <Chip label="Maintenance" color="default" size="small" />
            <Chip label="Cleaning" color="info" size="small" />
          </Box>
        </Paper>
      </Container>
  );
};

export default WardOccupancyPage;