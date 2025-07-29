import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  IconButton,
  LinearProgress,
  Alert,
  Chip,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  FormControlLabel,
  Checkbox,
  Grid
} from '@mui/material';
import {
  CloudUpload as UploadIcon,
  AttachFile as AttachIcon,
  Delete as DeleteIcon,
  InsertDriveFile as FileIcon,
  Image as ImageIcon,
  Description as DocIcon,
  Close as CloseIcon
} from '@mui/icons-material';
import { styled } from '@mui/material/styles';

const DropZone = styled(Paper)(({ theme, isDragOver }) => ({
  border: `2px dashed ${isDragOver ? theme.palette.primary.main : theme.palette.grey[300]}`,
  borderRadius: theme.shape.borderRadius,
  padding: theme.spacing(3),
  textAlign: 'center',
  cursor: 'pointer',
  transition: 'all 0.3s ease',
  backgroundColor: isDragOver ? theme.palette.action.hover : 'transparent',
  '&:hover': {
    borderColor: theme.palette.primary.main,
    backgroundColor: theme.palette.action.hover,
  },
}));

const FileUpload = ({
  category = 'medical-records',
  patientId = null,
  recordId = null,
  onUploadSuccess = () => {},
  onUploadError = () => {},
  onFilesSelected = () => {},
  maxFiles = 10,
  maxFileSize = 50 * 1024 * 1024, // 50MB
  allowedTypes = [
    'image/jpeg',
    'image/png',
    'image/gif',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    'text/csv'
  ],
  disabled = false,
  required = false,
  label = 'Upload Files',
  description = 'Drag and drop files here or click to select',
  deferUpload = false,
  selectedFiles = []
}) => {
  const [files, setFiles] = useState(selectedFiles || []);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [fileMetadata, setFileMetadata] = useState({
    description: '',
    tags: [],
    isPrivate: false
  });

  // Update files when selectedFiles prop changes
  useEffect(() => {
    if (deferUpload && selectedFiles) {
      setFiles(selectedFiles);
    }
  }, [selectedFiles, deferUpload]);
  const [currentTag, setCurrentTag] = useState('');
  
  const fileInputRef = useRef(null);

  const validateFile = (file) => {
    const errors = [];
    
    if (file.size > maxFileSize) {
      errors.push(`File "${file.name}" is too large (max ${Math.round(maxFileSize / (1024 * 1024))}MB)`);
    }
    
    if (!allowedTypes.includes(file.type)) {
      errors.push(`File "${file.name}" has unsupported type (${file.type})`);
    }
    
    if (!/^[a-zA-Z0-9._-\s]+$/.test(file.name)) {
      errors.push(`File "${file.name}" contains invalid characters`);
    }
    
    return errors;
  };

  const handleFileSelect = useCallback((selectedFiles) => {
    const fileList = Array.from(selectedFiles);
    const validFiles = [];
    const errors = [];

    fileList.forEach(file => {
      const fileErrors = validateFile(file);
      if (fileErrors.length === 0) {
        validFiles.push(file);
      } else {
        errors.push(...fileErrors);
      }
    });

    if (errors.length > 0) {
      setError(errors.join(', '));
      return;
    }

    if (files.length + validFiles.length > maxFiles) {
      setError(`Maximum ${maxFiles} files allowed`);
      return;
    }

    const newFiles = [...files, ...validFiles];
    setFiles(newFiles);
    setError(null);
    
    // If deferUpload is true, call onFilesSelected instead of uploading
    if (deferUpload) {
      onFilesSelected(newFiles);
    }
  }, [files, maxFiles, maxFileSize, allowedTypes, deferUpload, onFilesSelected]);

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    
    if (disabled) return;
    
    const droppedFiles = e.dataTransfer.files;
    handleFileSelect(droppedFiles);
  };

  const handleFileInputChange = (e) => {
    if (disabled) return;
    
    const selectedFiles = e.target.files;
    handleFileSelect(selectedFiles);
    
    // Reset input
    e.target.value = '';
  };

  const removeFile = (index) => {
    const newFiles = files.filter((_, i) => i !== index);
    setFiles(newFiles);
    setError(null);
    
    // If deferUpload is true, notify parent of file removal
    if (deferUpload) {
      onFilesSelected(newFiles);
    }
  };

  const addTag = () => {
    if (currentTag.trim() && !fileMetadata.tags.includes(currentTag.trim())) {
      setFileMetadata(prev => ({
        ...prev,
        tags: [...prev.tags, currentTag.trim()]
      }));
      setCurrentTag('');
    }
  };

  const removeTag = (tagToRemove) => {
    setFileMetadata(prev => ({
      ...prev,
      tags: prev.tags.filter(tag => tag !== tagToRemove)
    }));
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      addTag();
    }
  };

  const getFileIcon = (file) => {
    if (file.type.startsWith('image/')) {
      return <ImageIcon color="primary" />;
    } else if (file.type.includes('pdf') || file.type.includes('document')) {
      return <DocIcon color="primary" />;
    } else {
      return <FileIcon color="primary" />;
    }
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const uploadFiles = async () => {
    if (files.length === 0) {
      setError('Please select at least one file');
      return;
    }

    setUploading(true);
    setError(null);
    setSuccess(null);
    setUploadProgress(0);

    try {
      const formData = new FormData();
      
      // Add files
      files.forEach(file => {
        formData.append('files', file);
      });

      // Add metadata
      formData.append('category', category);
      if (patientId) formData.append('patientId', patientId);
      if (recordId) formData.append('recordId', recordId);
      if (fileMetadata.description) formData.append('description', fileMetadata.description);
      if (fileMetadata.tags.length > 0) formData.append('tags', JSON.stringify(fileMetadata.tags));
      formData.append('isPrivate', fileMetadata.isPrivate);

      // Get auth token
      const token = localStorage.getItem('token') || localStorage.getItem('dev_token');
      
      const xhr = new XMLHttpRequest();
      
      // Track upload progress
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const progress = (e.loaded / e.total) * 100;
          setUploadProgress(progress);
        }
      });

      // Handle response
      xhr.addEventListener('load', () => {
        if (xhr.status === 201) {
          const response = JSON.parse(xhr.responseText);
          setSuccess(`Successfully uploaded ${response.results.successful.length} file(s)`);
          setFiles([]);
          setFileMetadata({ description: '', tags: [], isPrivate: false });
          onUploadSuccess(response.results.successful);
        } else {
          const error = JSON.parse(xhr.responseText);
          setError(error.message || 'Upload failed');
          onUploadError(error);
        }
        setUploading(false);
        setUploadProgress(0);
      });

      xhr.addEventListener('error', () => {
        setError('Upload failed - network error');
        setUploading(false);
        setUploadProgress(0);
        onUploadError(new Error('Network error'));
      });

      // Send request
      xhr.open('POST', `${process.env.REACT_APP_API_URL || ''}/api/files/upload`);
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      xhr.send(formData);

    } catch (error) {
      console.error('Upload error:', error);
      setError('Upload failed: ' + error.message);
      setUploading(false);
      setUploadProgress(0);
      onUploadError(error);
    }
  };

  const clearAll = () => {
    setFiles([]);
    setFileMetadata({ description: '', tags: [], isPrivate: false });
    setError(null);
    setSuccess(null);
    
    // If deferUpload is true, notify parent of cleared files
    if (deferUpload) {
      onFilesSelected([]);
    }
  };

  return (
    <Box>
      <Typography variant="h6" gutterBottom>
        {label}
        {required && <span style={{ color: 'red' }}> *</span>}
      </Typography>

      {/* Drop Zone */}
      <DropZone
        isDragOver={isDragOver}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => !disabled && fileInputRef.current?.click()}
        sx={{ mb: 2 }}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={allowedTypes.join(',')}
          onChange={handleFileInputChange}
          style={{ display: 'none' }}
          disabled={disabled}
        />
        
        <UploadIcon sx={{ fontSize: 48, color: 'primary.main', mb: 1 }} />
        <Typography variant="body1" color="textPrimary" gutterBottom>
          {description}
        </Typography>
        <Typography variant="body2" color="textSecondary">
          Max {maxFiles} files, {Math.round(maxFileSize / (1024 * 1024))}MB each
        </Typography>
        <Button
          variant="outlined"
          startIcon={<AttachIcon />}
          sx={{ mt: 1 }}
          disabled={disabled}
        >
          Browse Files
        </Button>
      </DropZone>

      {/* File List */}
      {files.length > 0 && (
        <Box sx={{ mb: 2 }}>
          <Typography variant="subtitle1" gutterBottom>
            Selected Files ({files.length})
          </Typography>
          <List dense>
            {files.map((file, index) => (
              <ListItem key={index} divider>
                <ListItemText
                  primary={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      {getFileIcon(file)}
                      <Typography variant="body2" noWrap>
                        {file.name}
                      </Typography>
                    </Box>
                  }
                  secondary={formatFileSize(file.size)}
                />
                <ListItemSecondaryAction>
                  <IconButton
                    edge="end"
                    onClick={() => removeFile(index)}
                    disabled={disabled || uploading}
                  >
                    <DeleteIcon />
                  </IconButton>
                </ListItemSecondaryAction>
              </ListItem>
            ))}
          </List>
        </Box>
      )}

      {/* Metadata */}
      {files.length > 0 && (
        <Box sx={{ mb: 2 }}>
          <Typography variant="subtitle1" gutterBottom>
            File Information
          </Typography>
          <Grid container spacing={2}>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Description"
                value={fileMetadata.description}
                onChange={(e) => setFileMetadata(prev => ({ ...prev, description: e.target.value }))}
                disabled={disabled || uploading}
                multiline
                rows={2}
                placeholder="Enter a description for these files..."
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Add Tags"
                value={currentTag}
                onChange={(e) => setCurrentTag(e.target.value)}
                onKeyPress={handleKeyPress}
                disabled={disabled || uploading}
                placeholder="Enter a tag and press Enter"
                InputProps={{
                  endAdornment: (
                    <Button
                      onClick={addTag}
                      disabled={!currentTag.trim() || disabled || uploading}
                      size="small"
                    >
                      Add
                    </Button>
                  )
                }}
              />
              {fileMetadata.tags.length > 0 && (
                <Box sx={{ mt: 1, display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                  {fileMetadata.tags.map((tag) => (
                    <Chip
                      key={tag}
                      label={tag}
                      size="small"
                      onDelete={() => removeTag(tag)}
                      disabled={disabled || uploading}
                    />
                  ))}
                </Box>
              )}
            </Grid>
            <Grid item xs={12}>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={fileMetadata.isPrivate}
                    onChange={(e) => setFileMetadata(prev => ({ ...prev, isPrivate: e.target.checked }))}
                    disabled={disabled || uploading}
                  />
                }
                label="Mark as private (restricted access)"
              />
            </Grid>
          </Grid>
        </Box>
      )}

      {/* Upload Progress */}
      {uploading && (
        <Box sx={{ mb: 2 }}>
          <Typography variant="body2" color="textSecondary" gutterBottom>
            Uploading... {Math.round(uploadProgress)}%
          </Typography>
          <LinearProgress variant="determinate" value={uploadProgress} />
        </Box>
      )}

      {/* Error Alert */}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Success Alert */}
      {success && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess(null)}>
          {success}
        </Alert>
      )}

      {/* Action Buttons */}
      {files.length > 0 && (
        <Box sx={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
          <Button
            variant="outlined"
            onClick={clearAll}
            disabled={disabled || uploading}
            startIcon={<CloseIcon />}
          >
            Clear All
          </Button>
          <Button
            variant="contained"
            onClick={deferUpload ? () => {} : uploadFiles}
            disabled={disabled || uploading || files.length === 0}
            startIcon={<UploadIcon />}
          >
            {deferUpload ? `${files.length} File(s) Selected` : 'Upload Files'}
          </Button>
        </Box>
      )}
    </Box>
  );
};

export default FileUpload; 