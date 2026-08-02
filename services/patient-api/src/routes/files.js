const express = require('express');
const multer = require('multer');
const Joi = require('joi');
const { Readable } = require('stream');
const { pipeline } = require('stream/promises');
const router = express.Router();

const {
  storageService,
  BUCKETS,
  ALLOWED_FILE_TYPES,
  MAX_FILE_SIZE,
  isNotFoundError
} = require('../utils/storage');
const { authorize } = require('../middleware/auth');
const { logger } = require('../utils/logger');
const { auditLogger } = require('../utils/logger');
const FileAttachment = require('../models/FileAttachment');
const { getDB } = require('../utils/database');
const {
  findEncounterAccess,
  findPatientAccess,
} = require('../security/accessControl');
const { inspectFile } = require('../security/fileInspection');

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: 3
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
  encounterId: Joi.string().uuid().optional(),
  labOrderId: Joi.string().uuid().optional(),
  radiologyOrderId: Joi.string().uuid().optional(),
  prescriptionId: Joi.number().integer().positive().optional(),
  admissionId: Joi.string().uuid().optional(),
  description: Joi.string().max(500).optional(),
  tags: Joi.array().items(Joi.string().max(50)).optional(),
  isPrivate: Joi.boolean().default(false)
});

const fileParamsSchema = Joi.object({
  fileId: Joi.string().uuid().required()
});

const FILE_ROLES = ['doctor', 'nurse', 'lab-tech', 'radiologist', 'radiographer', 'pharmacist', 'admin'];

const CATEGORY_BUCKETS = Object.freeze({
  'medical-records': BUCKETS.medical_records,
  'patient-documents': BUCKETS.patient_documents,
  'system-files': BUCKETS.system_files
});

class InvalidStorageLocationError extends Error {}

const resolveStorageLocation = (attachment) => {
  const category = String(attachment.category || '');
  const uploadedBy = String(attachment.uploaded_by || '');
  const bucket = String(attachment.storage_bucket || '');
  const key = String(attachment.storage_key || '');
  const expectedBucket = CATEGORY_BUCKETS[category];
  const segments = key.split('/');

  if (
    !expectedBucket ||
    bucket !== expectedBucket ||
    !uploadedBy ||
    key.length === 0 ||
    key.length > 1024 ||
    /[\\%\x00-\x1F\x7F]/.test(key) ||
    segments.length !== 3 ||
    segments[0] !== category ||
    segments[1] !== uploadedBy ||
    !segments[2] ||
    segments[2] === '.' ||
    segments[2] === '..' ||
    !/^[A-Za-z0-9._-]+$/.test(segments[2])
  ) {
    throw new InvalidStorageLocationError('Attachment storage metadata failed validation');
  }

  return { bucket, key };
};

const isAdmin = (req) => (req.user?.roles || []).includes('admin');
const isOwner = (req, attachment) => String(req.user?.id || '') === String(attachment.uploaded_by || '');

class FileContextError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

const resolveFileContext = async (metadata) => {
  const lookups = [
    ['recordId', 'medical_records', 'id', 'patient_id', 'encounter_id', 'deleted_at IS NULL'],
    ['labOrderId', 'lab_orders', 'id', 'patient_id', 'encounter_id', null],
    ['radiologyOrderId', 'radiology_orders', 'id', 'patient_id', 'encounter_id', null],
    ['prescriptionId', 'prescriptions', 'id', 'patient_id', 'encounter_id', null],
    ['admissionId', 'admissions', 'id', 'patient_id', 'encounter_id', null],
  ];
  const resolved = [];
  for (const [key, table, idColumn, patientColumn, encounterColumn, condition] of lookups) {
    if (!metadata[key]) continue;
    const result = await getDB().query(
      `SELECT ${patientColumn} AS patient_id, ${encounterColumn} AS encounter_id
       FROM ${table} WHERE ${idColumn} = $1${condition ? ` AND ${condition}` : ''}`,
      [metadata[key]]
    );
    if (!result.rows.length) throw new FileContextError(`${key} was not found`, 404);
    resolved.push(result.rows[0]);
  }
  if (metadata.encounterId) {
    const encounter = await getDB().query(
      'SELECT patient_id, id AS encounter_id FROM encounters WHERE id = $1',
      [metadata.encounterId]
    );
    if (!encounter.rows.length) throw new FileContextError('Encounter was not found', 404);
    resolved.push(encounter.rows[0]);
  }

  const patientIds = new Set([
    ...(metadata.patientId ? [metadata.patientId] : []),
    ...resolved.map(item => item.patient_id).filter(Boolean)
  ]);
  const encounterIds = new Set([
    ...(metadata.encounterId ? [metadata.encounterId] : []),
    ...resolved.map(item => item.encounter_id).filter(Boolean)
  ]);
  if (patientIds.size > 1 || encounterIds.size > 1) {
    throw new FileContextError('The supplied patient, encounter, and clinical record contexts do not match', 409);
  }
  return {
    patientId: [...patientIds][0] || null,
    encounterId: [...encounterIds][0] || null
  };
};

const hasFileContextAccess = async (req, context) => {
  if (isAdmin(req)) return true;
  if (context.encounterId) {
    return Boolean(await findEncounterAccess(req.user, context.encounterId, 'clinical'));
  }
  return Boolean(context.patientId && await findPatientAccess(req.user, context.patientId, 'clinical'));
};

const requireFileAccess = async (req, res, next) => {
  try {
    const attachment = await FileAttachment.findById(req.params.fileId);
    if (!attachment) return res.status(404).json({ error: 'File not found' });
    if (attachment.category === 'system-files') {
      if (!isAdmin(req) && !isOwner(req, attachment)) return res.status(403).json({ error: 'Access denied' });
    } else if (!await hasFileContextAccess(req, {
      patientId: attachment.patient_id,
      encounterId: attachment.encounter_id
    })) {
      return res.status(403).json({ error: 'Patient file access denied' });
    }
    req.fileAttachment = attachment;
    return next();
  } catch (error) {
    logger.error('File authorization failed', { error: error.message, fileId: req.params.fileId });
    return res.status(503).json({ error: 'Unable to verify file access' });
  }
};

const safeContentType = (...candidates) => {
  const contentType = candidates
    .map(value => String(value || '').trim())
    .find(value => /^[A-Za-z0-9!#$&^_.+-]+\/[A-Za-z0-9!#$&^_.+-]+$/.test(value));
  return contentType || 'application/octet-stream';
};

const contentDisposition = (fileName) => {
  const cleaned = String(fileName || 'download')
    .split(/[\\/]/)
    .pop()
    .replace(/[\x00-\x1F\x7F]/g, '_')
    .slice(0, 180) || 'download';
  const ascii = cleaned.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_');
  const encoded = encodeURIComponent(cleaned).replace(/['()*]/g, char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
};

const pipeBody = async (body, response) => {
  if (body == null) throw new Error('Stored object has no response body');
  if (Buffer.isBuffer(body) || body instanceof Uint8Array) {
    await pipeline(Readable.from([body]), response);
    return;
  }
  if (typeof body.pipe === 'function') {
    await pipeline(body, response);
    return;
  }
  if (typeof body[Symbol.asyncIterator] === 'function') {
    await pipeline(Readable.from(body), response);
    return;
  }
  throw new Error('Stored object body is not streamable');
};

// POST /api/files/upload - Upload files
router.post('/upload',
  authorize(FILE_ROLES),
  upload.array('files', 10),
  async (req, res) => {
    try {
      if (!req.files || req.files.length === 0) {
        return res.status(400).json({
          error: 'No files provided'
        });
      }

      // Validate metadata
      logger.info('Authenticated file upload received', {
        userId: req.user.id,
        fileCount: req.files ? req.files.length : 0
      });
      
      const rawMetadata = { ...req.body };
      if (typeof rawMetadata.tags === 'string') {
        try {
          rawMetadata.tags = JSON.parse(rawMetadata.tags);
        } catch (_error) {
          rawMetadata.tags = rawMetadata.tags.split(',').map(tag => tag.trim()).filter(Boolean);
        }
      }
      const { error, value } = uploadMetadataSchema.validate(rawMetadata, { abortEarly: false });
      if (error) {
        logger.error('Validation error:', error.details);
        return res.status(400).json({
          error: 'Invalid metadata',
          details: error.details.map(d => d.message)
        });
      }

      const {
        category, recordId, patientId, encounterId, labOrderId,
        radiologyOrderId, prescriptionId, admissionId,
        description, tags, isPrivate
      } = value;
      if (category === 'system-files' && !isAdmin(req)) {
        return res.status(403).json({ error: 'System files require administrator access' });
      }

      const resolvedContext = await resolveFileContext(value);
      const resolvedPatientId = resolvedContext.patientId;
      const resolvedEncounterId = resolvedContext.encounterId;
      if (category !== 'system-files' && !resolvedPatientId) {
        return res.status(400).json({ error: 'Patient context is required for health files' });
      }
      if (category !== 'system-files' && !await hasFileContextAccess(req, resolvedContext)) {
        return res.status(403).json({ error: 'Patient file access denied' });
      }

      let inspections;
      try {
        inspections = await Promise.all(req.files.map(inspectFile));
      } catch (inspectionError) {
        logger.warn('File inspection rejected an upload', {
          error: inspectionError.message,
          userId: req.user.id,
          patientId: resolvedPatientId
        });
        return res.status(422).json({ error: inspectionError.message });
      }

      // Upload files
      const uploadPromises = req.files.map(async (file, index) => {
        let storageResult;
        try {
          const metadata = {
            category,
            isPrivate: 'true',
            uploadedBy: req.user.id
          };

          storageResult = await storageService.uploadFile(
            file,
            category,
            req.user.id,
            metadata
          );

          // Save file metadata to database
          const fileAttachment = await FileAttachment.create({
            medical_record_id: recordId,
            patient_id: resolvedPatientId,
            encounter_id: resolvedEncounterId,
            lab_order_id: labOrderId,
            radiology_order_id: radiologyOrderId,
            prescription_id: prescriptionId,
            admission_id: admissionId,
            file_name: file.originalname,
            file_type: file.mimetype,
            file_size: file.size,
            mime_type: file.mimetype,
            storage_path: storageResult.key,
            storage_bucket: storageResult.bucket,
            storage_key: storageResult.key,
            upload_url: storageResult.url,
            etag: storageResult.etag,
            metadata: storageResult.metadata,
            category: category,
            description: description,
            tags: tags ? tags.join(',') : null,
            is_private: true,
            detected_mime_type: inspections[index].detectedMimeType,
            malware_scan_status: inspections[index].malwareScanStatus,
            uploaded_by: req.user.id
          });

          // Log audit trail
          auditLogger.info('File uploaded', {
            userId: req.user.id,
            fileId: fileAttachment.id,
            fileSize: file.size,
            category,
            recordId,
            patientId: resolvedPatientId,
            encounterId: resolvedEncounterId,
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
          if (storageResult?.bucket && storageResult?.key) {
            try {
              await storageService.deleteFile(storageResult.bucket, storageResult.key);
            } catch (cleanupError) {
              logger.error('Failed to clean up object after metadata error', {
                error: cleanupError.message,
                bucket: storageResult.bucket,
                key: storageResult.key
              });
            }
          }
          return {
            error: 'File upload failed',
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

      const responseStatus = successful.length === 0 ? 502 : (failed.length > 0 ? 207 : 201);
      res.status(responseStatus).json({
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
      if (error instanceof FileContextError) {
        return res.status(error.status).json({ error: error.message });
      }
      logger.error('File upload endpoint error:', error);
      res.status(500).json({
        error: 'File upload failed',
        message: error.message
      });
    }
  }
);

// GET /api/files/:fileId - Download file
router.get('/:fileId([0-9a-fA-F-]{36})',
  authorize(FILE_ROLES),
  requireFileAccess,
  async (req, res) => {
    try {
      const { error, value } = fileParamsSchema.validate(req.params);
      if (error) {
        return res.status(400).json({
          error: 'Invalid file ID'
        });
      }

      const { fileId } = value;
      const attachment = req.fileAttachment;
      if (attachment.malware_scan_status !== 'clean') {
        return res.status(423).json({ error: 'File is quarantined pending security review' });
      }

      const { bucket, key } = resolveStorageLocation(attachment);
      const storedFile = await storageService.getFileStream(bucket, key);
      const contentLength = Number(storedFile.contentLength ?? attachment.file_size);

      res.status(200);
      res.setHeader('Content-Type', safeContentType(attachment.mime_type, storedFile.contentType));
      res.setHeader('Content-Disposition', contentDisposition(attachment.file_name));
      res.setHeader('Cache-Control', 'private, no-store, max-age=0');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      if (Number.isSafeInteger(contentLength) && contentLength >= 0) {
        res.setHeader('Content-Length', String(contentLength));
      }

      await pipeBody(storedFile.body, res);
      auditLogger.info('File downloaded', {
        userId: req.user.id,
        fileId,
        patientId: attachment.patient_id || null,
        recordId: attachment.medical_record_id || null,
        ip: req.ip
      });

    } catch (error) {
      logger.error('File download failed', { error: error.message, fileId: req.params.fileId, userId: req.user?.id });
      if (res.headersSent) {
        res.destroy();
        return;
      }
      if (error instanceof InvalidStorageLocationError) {
        return res.status(409).json({ error: 'File storage metadata is invalid' });
      }
      if (isNotFoundError(error)) return res.status(404).json({ error: 'Stored file not found' });
      return res.status(502).json({ error: 'File storage is unavailable' });
    }
  }
);

// GET /api/files - List files
router.get('/',
  authorize(FILE_ROLES),
  async (req, res) => {
    try {
      const {
        category, patientId, recordId, encounterId, labOrderId,
        radiologyOrderId, prescriptionId, admissionId, limit = 50
      } = req.query;

      // Validate query parameters
      const validCategories = ['medical-records', 'patient-documents', 'system-files'];
      if (category && !validCategories.includes(category)) {
        return res.status(400).json({
          error: 'Invalid category'
        });
      }

      const filters = {
        patientId, recordId, encounterId, labOrderId,
        radiologyOrderId, prescriptionId, admissionId, limit
      };
      const resolvedContext = await resolveFileContext(filters);
      if (!isAdmin(req) && !resolvedContext.patientId) {
        return res.status(400).json({ error: 'Patient, encounter, or clinical record context is required' });
      }
      if (resolvedContext.patientId && !await hasFileContextAccess(req, resolvedContext)) {
        return res.status(403).json({ error: 'Patient file access denied' });
      }

      let files = await FileAttachment.findByContext(filters);
      if (category) files = files.filter(file => file.category === category);

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
        uploadedBy: file.uploaded_by,
        encounterId: file.encounter_id,
        recordId: file.medical_record_id,
        labOrderId: file.lab_order_id,
        radiologyOrderId: file.radiology_order_id,
        prescriptionId: file.prescription_id,
        admissionId: file.admission_id,
        malwareScanStatus: file.malware_scan_status
      }));

      logger.info('Files listed', {
        userId: req.user.id,
        category,
        patientId,
        recordId,
        encounterId,
        count: formattedFiles.length
      });

      res.json({
        data: formattedFiles,
        meta: {
          count: formattedFiles.length
        }
      });

    } catch (error) {
      if (error instanceof FileContextError) {
        return res.status(error.status).json({ error: error.message });
      }
      logger.error('File listing error:', error);
      res.status(500).json({
        error: 'Failed to list files',
        message: error.message
      });
    }
  }
);

// DELETE /api/files/:fileId - Delete file
router.delete('/:fileId([0-9a-fA-F-]{36})',
  authorize(['admin']),
  requireFileAccess,
  async (req, res) => {
    try {
      const { error, value } = fileParamsSchema.validate(req.params);
      if (error) {
        return res.status(400).json({
          error: 'Invalid file ID'
        });
      }

      const { fileId } = value;
      const reason = String(req.get('X-Archive-Reason') || '').trim();
      if (reason.length < 20 || reason.length > 500) {
        return res.status(400).json({
          error: 'An archive reason between 20 and 500 characters is required'
        });
      }
      const attachment = await FileAttachment.findById(fileId);
      if (!attachment) return res.status(404).json({ error: 'File not found' });

      if (!isAdmin(req) && !isOwner(req, attachment)) {
        auditLogger.info('File deletion denied', {
          userId: req.user.id,
          fileId,
          reason: 'not-owner',
          ip: req.ip
        });
        return res.status(403).json({ error: 'Access denied' });
      }

      resolveStorageLocation(attachment);
      await attachment.archive(req.user.id, reason);

      auditLogger.info('File archived', {
        userId: req.user.id,
        fileId,
        patientId: attachment.patient_id || null,
        recordId: attachment.medical_record_id || null,
        ip: req.ip
      });

      return res.json({ message: 'File archived successfully', id: fileId });

    } catch (error) {
      logger.error('File deletion failed', { error: error.message, fileId: req.params.fileId, userId: req.user?.id });
      if (error instanceof InvalidStorageLocationError) {
        return res.status(409).json({ error: 'File storage metadata is invalid' });
      }
      if (isNotFoundError(error)) return res.status(404).json({ error: 'Stored file not found' });
      return res.status(502).json({ error: 'File storage is unavailable' });
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
        maxFileSizeMB: MAX_FILE_SIZE / (1024 * 1024),
        maxFilesPerUpload: 3
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
        message: 'Maximum 3 files per upload'
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
