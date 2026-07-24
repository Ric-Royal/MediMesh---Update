jest.mock('../../utils/storage', () => ({
  storageService: {
    uploadFile: jest.fn(),
    getFileStream: jest.fn(),
    deleteFile: jest.fn()
  },
  BUCKETS: {
    medical_records: 'medimesh-medical-records',
    patient_documents: 'medimesh-patient-documents',
    system_files: 'medimesh-system-files'
  },
  ALLOWED_FILE_TYPES: {
    images: ['image/jpeg', 'image/png'],
    documents: ['application/pdf'],
    medical: ['application/dicom'],
    spreadsheets: ['application/vnd.ms-excel'],
    text: ['text/plain', 'text/csv']
  },
  MAX_FILE_SIZE: 50 * 1024 * 1024,
  isNotFoundError: error => error?.$metadata?.httpStatusCode === 404
}));
jest.mock('../../models/FileAttachment', () => ({
  create: jest.fn(),
  findById: jest.fn(),
  findByRecordId: jest.fn(),
  findByPatientId: jest.fn(),
  findByCategory: jest.fn()
}));
jest.mock('../../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
  auditLogger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
}));
jest.mock('../../utils/database', () => ({
  getDB: () => ({ query: jest.fn().mockResolvedValue({ rows: [] }) })
}));
jest.mock('../../security/accessControl', () => ({
  findPatientAccess: jest.fn().mockResolvedValue(true),
  requirePatientResourceAccess: () => (req, res, next) => next()
}));
jest.mock('../../security/fileInspection', () => ({
  inspectFile: jest.fn().mockResolvedValue({
    detectedMimeType: 'text/plain',
    malwareScanStatus: 'clean'
  })
}));

const express = require('express');
const { Readable } = require('stream');
const request = require('supertest');
const { storageService } = require('../../utils/storage');
const FileAttachment = require('../../models/FileAttachment');
const { auditLogger } = require('../../utils/logger');
const fileRouter = require('../files');

describe('file routes', () => {
  const fileId = '1d38f79b-0f67-48b0-8868-918eae24976e';
  const ownerId = '550e8400-e29b-41d4-a716-446655440001';
  const otherId = '550e8400-e29b-41d4-a716-446655440002';
  const objectKey = `system-files/${ownerId}/1784322375328-a62bc02e-fdcd-4397-8448-ab9c43bce945-clinical-note.txt`;

  const app = express();
  app.use((req, res, next) => {
    req.user = {
      id: req.get('x-user-id') || ownerId,
      roles: [req.get('x-role') || 'doctor', 'user']
    };
    next();
  });
  app.use('/api/files', fileRouter);

  const attachment = (overrides = {}) => ({
    id: fileId,
    file_name: 'clinical-note.txt',
    file_size: 9,
    mime_type: 'text/plain',
    storage_bucket: 'medimesh-system-files',
    storage_key: objectKey,
    category: 'system-files',
    uploaded_by: ownerId,
    is_private: false,
    patient_id: 'a276d8a6-9ed4-4439-b0c7-1d24aa825fcc',
    medical_record_id: null,
    malware_scan_status: 'clean',
    archive: jest.fn().mockResolvedValue({}),
    ...overrides
  });

  beforeEach(() => {
    jest.clearAllMocks();
    storageService.uploadFile.mockResolvedValue({
      bucket: 'medimesh-system-files',
      key: objectKey
    });
    storageService.getFileStream.mockResolvedValue({
      body: Readable.from([Buffer.from('MediMesh!')]),
      contentType: 'text/plain',
      contentLength: 9
    });
    storageService.deleteFile.mockResolvedValue(true);
    FileAttachment.findById.mockResolvedValue(attachment());
    FileAttachment.create.mockResolvedValue(attachment({ upload_date: new Date('2026-07-18T08:00:00Z') }));
  });

  test('streams an authorized attachment with private no-cache headers', async () => {
    const response = await request(app).get(`/api/files/${fileId}`);

    expect(response.status).toBe(200);
    expect(response.text).toBe('MediMesh!');
    expect(response.headers['content-type']).toMatch(/^text\/plain/);
    expect(response.headers['content-disposition']).toContain('clinical-note.txt');
    expect(response.headers['cache-control']).toBe('private, no-store, max-age=0');
    expect(storageService.getFileStream).toHaveBeenCalledWith('medimesh-system-files', objectKey);
    expect(auditLogger.info).toHaveBeenCalledWith('File downloaded', expect.objectContaining({ fileId, userId: ownerId }));
  });

  test('blocks non-owner access to a private attachment', async () => {
    FileAttachment.findById.mockResolvedValue(attachment({ is_private: true }));

    const response = await request(app)
      .get(`/api/files/${fileId}`)
      .set('x-user-id', otherId)
      .set('x-role', 'nurse');

    expect(response.status).toBe(403);
    expect(storageService.getFileStream).not.toHaveBeenCalled();
  });

  test('rejects a database key containing traversal segments before storage access', async () => {
    FileAttachment.findById.mockResolvedValue(attachment({
      storage_key: `system-files/${ownerId}/../secret.txt`
    }));

    const response = await request(app).get(`/api/files/${fileId}`);

    expect(response.status).toBe(409);
    expect(storageService.getFileStream).not.toHaveBeenCalled();
  });

  test('rejects a bucket that conflicts with the attachment category', async () => {
    FileAttachment.findById.mockResolvedValue(attachment({
      storage_bucket: 'medimesh-medical-records'
    }));

    const response = await request(app).get(`/api/files/${fileId}`);

    expect(response.status).toBe(409);
    expect(storageService.getFileStream).not.toHaveBeenCalled();
  });

  test('preserves role authorization before attachment lookup', async () => {
    const response = await request(app)
      .get(`/api/files/${fileId}`)
      .set('x-role', 'receptionist');

    expect(response.status).toBe(403);
    expect(FileAttachment.findById).not.toHaveBeenCalled();
  });

  test('prevents a clinician from archiving retained attachments', async () => {
    const record = attachment();
    FileAttachment.findById.mockResolvedValue(record);

    const response = await request(app).delete(`/api/files/${fileId}`);

    expect(response.status).toBe(403);
    expect(storageService.deleteFile).not.toHaveBeenCalled();
    expect(record.archive).not.toHaveBeenCalled();
  });

  test('blocks a non-owner doctor from deleting the attachment', async () => {
    const record = attachment();
    FileAttachment.findById.mockResolvedValue(record);

    const response = await request(app)
      .delete(`/api/files/${fileId}`)
      .set('x-user-id', otherId);

    expect(response.status).toBe(403);
    expect(storageService.deleteFile).not.toHaveBeenCalled();
    expect(record.archive).not.toHaveBeenCalled();
  });

  test('allows an administrator to archive another user attachment without deleting storage', async () => {
    const record = attachment();
    FileAttachment.findById.mockResolvedValue(record);

    const response = await request(app)
      .delete(`/api/files/${fileId}`)
      .set('x-user-id', otherId)
      .set('x-role', 'admin')
      .set('X-Archive-Reason', 'Patient record retention request reviewed');

    expect(response.status).toBe(200);
    expect(storageService.deleteFile).not.toHaveBeenCalled();
    expect(record.archive).toHaveBeenCalledWith(
      otherId,
      'Patient record retention request reviewed'
    );
  });

  test('accepts a valid multipart upload through Multer 2', async () => {
    const response = await request(app)
      .post('/api/files/upload')
      .set('x-role', 'admin')
      .field('category', 'system-files')
      .attach('files', Buffer.from('MediMesh!'), {
        filename: 'clinical-note.txt',
        contentType: 'text/plain'
      });

    expect(response.status).toBe(201);
    expect(response.body.results.summary).toEqual({ total: 1, successful: 1, failed: 0 });
    expect(storageService.uploadFile).toHaveBeenCalledWith(
      expect.objectContaining({ originalname: 'clinical-note.txt', mimetype: 'text/plain', size: 9 }),
      'system-files',
      ownerId,
      expect.objectContaining({ category: 'system-files', uploadedBy: ownerId })
    );
    expect(FileAttachment.create).toHaveBeenCalledTimes(1);
  });

  test('rejects a disallowed multipart type before storage', async () => {
    const response = await request(app)
      .post('/api/files/upload')
      .set('x-role', 'admin')
      .field('category', 'system-files')
      .attach('files', Buffer.from('binary'), {
        filename: 'payload.exe',
        contentType: 'application/x-msdownload'
      });

    expect(response.status).toBe(400);
    expect(storageService.uploadFile).not.toHaveBeenCalled();
  });

  test('removes an uploaded object when metadata persistence fails', async () => {
    FileAttachment.create.mockRejectedValue(new Error('database unavailable'));

    const response = await request(app)
      .post('/api/files/upload')
      .set('x-role', 'admin')
      .field('category', 'system-files')
      .attach('files', Buffer.from('MediMesh!'), {
        filename: 'clinical-note.txt',
        contentType: 'text/plain'
      });

    expect(response.status).toBe(502);
    expect(response.body.results.failed[0].error).toBe('File upload failed');
    expect(storageService.deleteFile).toHaveBeenCalledWith('medimesh-system-files', objectKey);
  });
});
