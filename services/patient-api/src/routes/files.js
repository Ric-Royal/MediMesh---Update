const express = require('express');
const multer = require('multer');
const Joi = require('joi');
const router = express.Router();

const { storageService, BUCKETS, ALLOWED_FILE_TYPES, MAX_FILE_SIZE } = require('../utils/storage');
const { authorize } = require('../middleware/auth');
const { logger } = require('../utils/logger');
const { auditLogger } = require('../utils/logger');
const FileAttachment = require('../models/FileAttachment');

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: 10 // Maximum 10 files per upload
  },
  fileFilter: (req, file, cb) => {
    // Check file type
    const allowedTypes = [
      ...ALLOWED_FILE_TYPES.images,
      ...ALLOWED_FILE_TYPES.documents,
      ...ALLOWED_FILE_TYPES.medical,
      ...ALLOWED_FILE_TYPES.spreadsheets,
      ...ALLOWED_FILE_TYPES.text
    ];
    
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${file.mimetype} is not allowed`), false);
    }
  }
});

// Validation schemas
const uploadMetadataSchema = Joi.object({
  category: Joi.string().valid('medical-records', 'patient-documents', 'system-files').required(),
  recordId: Joi.string().uuid().optional(),
  patientId: Joi.string().uuid().optional(),
  description: Joi.string().max(500).optional(),
  tags: Joi.array().items(Joi.string().max(50)).optional(),
  isPrivate: Joi.boolean().default(false)
});

const fileParamsSchema = Joi.object({
  fileId: Joi.string().uuid().required()
});

// POST /api/files/upload - Upload files
router.post('/upload',
  authorize(['doctor', 'nurse', 'admin']),
  upload.array('files', 10),
  async (req, res) => {
    try {
      if (!req.files || req.files.length === 0) {
        return res.status(400).json({
          error: 'No files provided'
        });
      }

      // Validate metadata
      logger.info('Upload request body:', req.body);
      logger.info('Upload files:', req.files ? req.files.length : 0);
      
      const { error, value } = uploadMetadataSchema.validate(req.body);
      if (error) {
        logger.error('Validation error:', error.details);
        return res.status(400).json({
          error: 'Invalid metadata',
          details: error.details.map(d => d.message)
        });
      }

      const { category, recordId, patientId, description, tags, isPrivate } = value;

      // Upload files
      const uploadPromises = req.files.map(async (file) => {
        try {
          const metadata = {
            category,
            recordId,
            patientId,
            description,
            tags: tags ? tags.join(',') : '',
            isPrivate: isPrivate.toString(),
            uploadedBy: req.user.id
          };

          const storageResult = await storageService.uploadFile(
            file,
            category,
            req.user.id,
            metadata
          );

          // Save file metadata to database
          const fileAttachment = await FileAttachment.create({
            medical_record_id: recordId,
            patient_id: patientId,
            file_name: file.originalname,
            file_type: file.mimetype,
            file_size: file.size,
            mime_type: file.mimetype,
            storage_path: storageResult.path,
            storage_bucket: storageResult.bucket,
            storage_key: storageResult.key,
            category: category,
            description: description,
            tags: tags ? tags.join(',') : null,
            is_private: isPrivate,
            uploaded_by: req.user.id
          });

          // Log audit trail
          auditLogger.info('File uploaded', {
            userId: req.user.id,
            fileId: fileAttachment.id,
            fileName: file.originalname,
            fileSize: file.size,
            category,
            recordId,
            patientId,
            timestamp: new Date().toISOString(),
            ip: req.ip
          });

          return {
            id: fileAttachment.id,
            fileName: fileAttachment.file_name,
            fileSize: fileAttachment.file_size,
            mimeType: fileAttachment.mime_type,
            category: fileAttachment.category,
            uploadDate: fileAttachment.upload_date
          };
        } catch (uploadError) {
          logger.error('Individual file upload failed:', uploadError);
          return {
            error: uploadError.message,
            filename: file.originalname
          };
        }
      });

      const results = await Promise.all(uploadPromises);
      const successful = results.filter(r => !r.error);
      const failed = results.filter(r => r.error);

      logger.info('File upload completed', {
        userId: req.user.id,
        totalFiles: req.files.length,
        successful: successful.length,
        failed: failed.length
      });

      res.status(201).json({
        message: 'File upload completed',
        results: {
          successful,
          failed,
          summary: {
            total: req.files.length,
            successful: successful.length,
            failed: failed.length
          }
        }
      });

    } catch (error) {
      logger.error('File upload endpoint error:', error);
      res.status(500).json({
        error: 'File upload failed',
        message: error.message
      });
    }
  }
);

// GET /api/files/:fileId - Download file
router.get('/:fileId',
  authorize(['doctor', 'nurse', 'admin']),
  async (req, res) => {
    try {
      const { error, value } = fileParamsSchema.validate(req.params);
      if (error) {
        return res.status(400).json({
          error: 'Invalid file ID'
        });
      }

      const { fileId } = value;

      // TODO: Get file info from database
      // For now, this is a simplified version
      // In a real implementation, you'd query the database to get bucket and key
      
      res.status(501).json({
        error: 'File download not yet implemented',
        message: 'Database integration needed for file metadata'
      });

    } catch (error) {
      logger.error('File download error:', error);
      res.status(500).json({
        error: 'File download failed',
        message: error.message
      });
    }
  }
);

// GET /api/files - List files
router.get('/',
  authorize(['doctor', 'nurse', 'admin']),
  async (req, res) => {
    try {
      const { category, patientId, recordId, limit = 50 } = req.query;

      // Validate query parameters
      const validCategories = ['medical-records', 'patient-documents', 'system-files'];
      if (category && !validCategories.includes(category)) {
        return res.status(400).json({
          error: 'Invalid category'
        });
      }

      let files = [];

      // Get files from database based on filters
      if (recordId) {
        files = await FileAttachment.findByRecordId(recordId);
      } else if (patientId) {
        files = await FileAttachment.findByPatientId(patientId);
      } else if (category) {
        files = await FileAttachment.findByCategory(category, { limit: parseInt(limit) });
      } else {
        // Get all files with limit
        files = await FileAttachment.findByCategory('medical-records', { limit: parseInt(limit) });
      }

      // Format response
      const formattedFiles = files.map(file => ({
        id: file.id,
        fileName: file.file_name,
        fileSize: file.file_size,
        mimeType: file.mime_type,
        category: file.category,
        description: file.description,
        tags: file.tags ? file.tags.split(',') : [],
        isPrivate: file.is_private,
        uploadDate: file.upload_date,
        uploadedBy: file.uploaded_by
      }));

      logger.info('Files listed', {
        userId: req.user.id,
        category,
        patientId,
        recordId,
        count: formattedFiles.length
      });

      res.json({
        data: formattedFiles,
        meta: {
          count: formattedFiles.length
        }
      });

    } catch (error) {
      logger.error('File listing error:', error);
      res.status(500).json({
        error: 'Failed to list files',
        message: error.message
      });
    }
  }
);

// DELETE /api/files/:fileId - Delete file
router.delete('/:fileId',
  authorize(['doctor', 'admin']),
  async (req, res) => {
    try {
      const { error, value } = fileParamsSchema.validate(req.params);
      if (error) {
        return res.status(400).json({
          error: 'Invalid file ID'
        });
      }

      const { fileId } = value;

      // TODO: Get file info from database and delete
      // For now, this is a simplified version
      
      res.status(501).json({
        error: 'File deletion not yet implemented',
        message: 'Database integration needed for file metadata'
      });

    } catch (error) {
      logger.error('File deletion error:', error);
      res.status(500).json({
        error: 'File deletion failed',
        message: error.message
      });
    }
  }
);

// GET /api/files/info/allowed-types - Get allowed file types
router.get('/info/allowed-types',
  authorize(['doctor', 'nurse', 'admin']),
  (req, res) => {
    res.json({
      data: {
        allowedTypes: ALLOWED_FILE_TYPES,
        maxFileSize: MAX_FILE_SIZE,
        maxFileSizeMB: MAX_FILE_SIZE / (1024 * 1024)
      }
    });
  }
);

// GET /api/files/info/categories - Get file categories
router.get('/info/categories',
  authorize(['doctor', 'nurse', 'admin']),
  (req, res) => {
    res.json({
      data: {
        categories: [
          {
            id: 'medical-records',
            name: 'Medical Records',
            description: 'Files related to medical records',
            bucket: BUCKETS.medical_records
          },
          {
            id: 'patient-documents',
            name: 'Patient Documents',
            description: 'General patient documents',
            bucket: BUCKETS.patient_documents
          },
          {
            id: 'system-files',
            name: 'System Files',
            description: 'System and administrative files',
            bucket: BUCKETS.system_files
          }
        ]
      }
    });
  }
);

// Error handling middleware for multer
router.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        error: 'File too large',
        message: `Maximum file size is ${MAX_FILE_SIZE / (1024 * 1024)}MB`
      });
    }
    if (error.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({
        error: 'Too many files',
        message: 'Maximum 10 files per upload'
      });
    }
  }
  
  if (error.message.includes('File type')) {
    return res.status(400).json({
      error: 'Invalid file type',
      message: error.message
    });
  }

  next(error);
});

module.exports = router; 