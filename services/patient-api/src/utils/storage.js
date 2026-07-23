const {
  S3Client,
  HeadBucketCommand,
  CreateBucketCommand,
  PutBucketPolicyCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command
} = require('@aws-sdk/client-s3');
const { Upload } = require('@aws-sdk/lib-storage');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { v4: uuidv4 } = require('uuid');
const { logger } = require('./logger');

// MinIO S3 configuration
const s3 = new S3Client({
  endpoint: process.env.MINIO_ENDPOINT || 'http://minio:9000',
  credentials: {
    accessKeyId: process.env.MINIO_ACCESS_KEY || 'medimesh-admin',
    secretAccessKey: process.env.MINIO_SECRET_KEY || 'MediMeshMinio2024!'
  },
  forcePathStyle: true,
  region: 'us-east-1'
});

const isNotFoundError = (error) => (
  error?.$metadata?.httpStatusCode === 404 ||
  error?.statusCode === 404 ||
  error?.name === 'NotFound' ||
  error?.Code === 'NoSuchBucket'
);

const bodyToBuffer = async (body) => {
  if (body == null) return Buffer.alloc(0);
  if (Buffer.isBuffer(body)) return body;
  if (body instanceof Uint8Array) return Buffer.from(body);
  if (typeof body.transformToByteArray === 'function') {
    return Buffer.from(await body.transformToByteArray());
  }

  const chunks = [];
  for await (const chunk of body) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
};

// Healthcare file types configuration
const ALLOWED_FILE_TYPES = {
  images: ['image/jpeg', 'image/png', 'image/gif', 'image/bmp', 'image/tiff'],
  documents: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  medical: ['application/dicom', 'image/x-portable-anymap', 'image/x-portable-bitmap'],
  spreadsheets: ['application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  text: ['text/plain', 'text/csv']
};

const ALL_ALLOWED_TYPES = [
  ...ALLOWED_FILE_TYPES.images,
  ...ALLOWED_FILE_TYPES.documents,
  ...ALLOWED_FILE_TYPES.medical,
  ...ALLOWED_FILE_TYPES.spreadsheets,
  ...ALLOWED_FILE_TYPES.text
];

// Maximum file size (50MB)
const MAX_FILE_SIZE = 50 * 1024 * 1024;

// Bucket names
const BUCKETS = {
  medical_records: 'medimesh-medical-records',
  patient_documents: 'medimesh-patient-documents',
  system_files: 'medimesh-system-files'
};

class StorageService {
  constructor(client = s3, options = {}) {
    this.s3 = client;
    this.createUpload = options.createUpload || (uploadOptions => new Upload(uploadOptions));
    this.presign = options.getSignedUrl || getSignedUrl;
    this.serverSideEncryption = options.serverSideEncryption !== undefined
      ? options.serverSideEncryption
      : String(process.env.S3_SERVER_SIDE_ENCRYPTION || '').trim();
    if (options.initializeBuckets !== false) {
      this.initialization = this.initializeBuckets();
    }
  }

  async initializeBuckets() {
    try {
      for (const [name, bucket] of Object.entries(BUCKETS)) {
        await this.createBucketIfNotExists(bucket);
      }
      logger.info('MinIO buckets initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize MinIO buckets:', error);
    }
  }

  async createBucketIfNotExists(bucketName) {
    try {
      await this.s3.send(new HeadBucketCommand({ Bucket: bucketName }));
      logger.info(`Bucket ${bucketName} already exists`);
    } catch (error) {
      if (isNotFoundError(error)) {
        try {
          await this.s3.send(new CreateBucketCommand({ Bucket: bucketName }));
          logger.info(`Created bucket: ${bucketName}`);
          
          // Set bucket policy for healthcare compliance
          await this.setBucketPolicy(bucketName);
        } catch (createError) {
          logger.error(`Failed to create bucket ${bucketName}:`, createError);
        }
      } else {
        logger.error(`Error checking bucket ${bucketName}:`, error);
      }
    }
  }

  async setBucketPolicy(bucketName) {
    // Private bucket policy for healthcare data
    const policy = {
      Version: '2012-10-17',
      Statement: [
        {
          Effect: 'Deny',
          Principal: '*',
          Action: 's3:*',
          Resource: [
            `arn:aws:s3:::${bucketName}/*`,
            `arn:aws:s3:::${bucketName}`
          ],
          Condition: {
            Bool: {
              'aws:SecureTransport': 'false'
            }
          }
        }
      ]
    };

    try {
      await this.s3.send(new PutBucketPolicyCommand({
        Bucket: bucketName,
        Policy: JSON.stringify(policy)
      }));
      logger.info(`Set security policy for bucket: ${bucketName}`);
    } catch (error) {
      logger.error(`Failed to set bucket policy for ${bucketName}:`, error);
    }
  }

  validateFile(file) {
    const errors = [];

    // Check file size
    if (file.size > MAX_FILE_SIZE) {
      errors.push(`File size exceeds maximum limit of ${MAX_FILE_SIZE / (1024 * 1024)}MB`);
    }

    // Check file type
    if (!ALL_ALLOWED_TYPES.includes(file.mimetype)) {
      errors.push(`File type ${file.mimetype} is not allowed`);
    }

    // Check filename for security
    if (!/^[a-zA-Z0-9._-]+$/.test(file.originalname)) {
      errors.push('Filename contains invalid characters');
    }

    return errors;
  }

  generateFileKey(folder, originalName, userId) {
    const ext = originalName.split('.').pop();
    const sanitizedName = originalName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const timestamp = Date.now();
    const uuid = uuidv4();
    
    return `${folder}/${userId}/${timestamp}-${uuid}-${sanitizedName}`;
  }

  // Sanitize metadata values for S3 headers
  sanitizeMetadata(metadata) {
    const sanitized = {};
    for (const [key, value] of Object.entries(metadata)) {
      if (value != null) {
        // S3 metadata headers can't contain:
        // - Non-ASCII characters
        // - Control characters (including newlines, tabs)
        // - Leading/trailing spaces
        const sanitizedValue = String(value)
          .replace(/[\x00-\x1F\x7F-\xFF]/g, '') // Remove control and non-ASCII characters
          .replace(/\s+/g, ' ') // Replace multiple spaces with single space
          .trim() // Trim leading/trailing spaces
          .substring(0, 2048); // S3 metadata value limit
        
        if (sanitizedValue) {
          sanitized[key] = sanitizedValue;
        }
      }
    }
    return sanitized;
  }

  async uploadFile(file, folder, userId, metadata = {}) {
    try {
      // Validate file
      const validationErrors = this.validateFile(file);
      if (validationErrors.length > 0) {
        throw new Error(`File validation failed: ${validationErrors.join(', ')}`);
      }

      // Determine bucket based on folder
      let bucketName = BUCKETS.system_files;
      if (folder.includes('medical-records')) {
        bucketName = BUCKETS.medical_records;
      } else if (folder.includes('patient-documents')) {
        bucketName = BUCKETS.patient_documents;
      }

      // Generate unique file key
      const fileKey = this.generateFileKey(folder, file.originalname, userId);

      // Sanitize metadata for S3 headers
      const sanitizedMetadata = this.sanitizeMetadata({
        'uploaded-by': userId,
        'original-name': file.originalname,
        'upload-date': new Date().toISOString(),
        ...metadata
      });

      // Prepare upload parameters
      const uploadParams = {
        Bucket: bucketName,
        Key: fileKey,
        Body: file.buffer,
        ContentType: file.mimetype,
        ContentDisposition: `attachment; filename="${file.originalname}"`,
        Metadata: sanitizedMetadata
      };
      if (this.serverSideEncryption) {
        uploadParams.ServerSideEncryption = this.serverSideEncryption;
      }

      // Upload file
      const upload = this.createUpload({
        client: this.s3,
        params: uploadParams,
        leavePartsOnError: false
      });
      const result = await upload.done();

      const fileInfo = {
        id: uuidv4(),
        key: fileKey,
        bucket: bucketName,
        originalName: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        url: result.Location,
        etag: result.ETag,
        uploadedBy: userId,
        uploadedAt: new Date().toISOString(),
        metadata: metadata
      };

      logger.info('File uploaded successfully', {
        fileKey,
        bucket: bucketName,
        userId,
        size: file.size,
        type: file.mimetype
      });

      return fileInfo;
    } catch (error) {
      logger.error('File upload failed:', error);
      throw error;
    }
  }

  async downloadFile(bucketName, fileKey) {
    try {
      const result = await this.getFileStream(bucketName, fileKey);
      const body = await bodyToBuffer(result.body);
      
      logger.info('File downloaded successfully', {
        bucket: bucketName,
        key: fileKey
      });

      return {
        body,
        contentType: result.contentType,
        contentLength: result.contentLength,
        lastModified: result.lastModified,
        metadata: result.metadata
      };
    } catch (error) {
      logger.error('File download failed:', error);
      throw error;
    }
  }

  async getFileStream(bucketName, fileKey) {
    try {
      const result = await this.s3.send(new GetObjectCommand({
        Bucket: bucketName,
        Key: fileKey
      }));

      return {
        body: result.Body,
        contentType: result.ContentType,
        contentLength: result.ContentLength,
        lastModified: result.LastModified,
        etag: result.ETag,
        metadata: result.Metadata
      };
    } catch (error) {
      logger.error('Failed to open file stream:', error);
      throw error;
    }
  }

  async getFileInfo(bucketName, fileKey) {
    try {
      const headParams = {
        Bucket: bucketName,
        Key: fileKey
      };

      const result = await this.s3.send(new HeadObjectCommand(headParams));
      
      return {
        contentType: result.ContentType,
        contentLength: result.ContentLength,
        lastModified: result.LastModified,
        etag: result.ETag,
        metadata: result.Metadata
      };
    } catch (error) {
      logger.error('Failed to get file info:', error);
      throw error;
    }
  }

  async deleteFile(bucketName, fileKey) {
    try {
      const deleteParams = {
        Bucket: bucketName,
        Key: fileKey
      };

      await this.s3.send(new DeleteObjectCommand(deleteParams));
      
      logger.info('File deleted successfully', {
        bucket: bucketName,
        key: fileKey
      });

      return true;
    } catch (error) {
      logger.error('File deletion failed:', error);
      throw error;
    }
  }

  async listFiles(bucketName, prefix = '', limit = 100) {
    try {
      const listParams = {
        Bucket: bucketName,
        Prefix: prefix,
        MaxKeys: limit
      };

      const result = await this.s3.send(new ListObjectsV2Command(listParams));
      
      return {
        files: result.Contents || [],
        isTruncated: result.IsTruncated,
        nextToken: result.NextContinuationToken
      };
    } catch (error) {
      logger.error('Failed to list files:', error);
      throw error;
    }
  }

  async generatePresignedUrl(bucketName, fileKey, expiry = 3600) {
    try {
      const command = new GetObjectCommand({ Bucket: bucketName, Key: fileKey });
      const url = await this.presign(this.s3, command, { expiresIn: expiry });
      
      logger.info('Generated presigned URL', {
        bucket: bucketName,
        key: fileKey,
        expiry
      });

      return url;
    } catch (error) {
      logger.error('Failed to generate presigned URL:', error);
      throw error;
    }
  }

  async cleanupExpiredFiles(bucketName, days = 30) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);

      const listResult = await this.listFiles(bucketName);
      const expiredFiles = listResult.files.filter(file => 
        new Date(file.LastModified) < cutoffDate
      );

      const deletePromises = expiredFiles.map(file => 
        this.deleteFile(bucketName, file.Key)
      );

      await Promise.all(deletePromises);
      
      logger.info('Cleanup completed', {
        bucket: bucketName,
        deletedCount: expiredFiles.length
      });

      return expiredFiles.length;
    } catch (error) {
      logger.error('Cleanup failed:', error);
      throw error;
    }
  }
}

// Create singleton instance
const storageService = new StorageService(s3, {
  initializeBuckets: process.env.NODE_ENV !== 'test'
});

module.exports = {
  storageService,
  StorageService,
  BUCKETS,
  ALLOWED_FILE_TYPES,
  MAX_FILE_SIZE,
  bodyToBuffer,
  isNotFoundError
};
