const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');
const mime = require('mime-types');
const { logger } = require('./logger');

// MinIO S3 configuration
const s3 = new AWS.S3({
  endpoint: process.env.MINIO_ENDPOINT || 'http://minio:9000',
  accessKeyId: process.env.MINIO_ACCESS_KEY || 'medimesh-admin',
  secretAccessKey: process.env.MINIO_SECRET_KEY || 'MediMeshMinio2024!',
  s3ForcePathStyle: true,
  signatureVersion: 'v4',
  region: 'us-east-1'
});

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
  constructor() {
    this.initializeBuckets();
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
      await s3.headBucket({ Bucket: bucketName }).promise();
      logger.info(`Bucket ${bucketName} already exists`);
    } catch (error) {
      if (error.statusCode === 404) {
        try {
          await s3.createBucket({ Bucket: bucketName }).promise();
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
      await s3.putBucketPolicy({
        Bucket: bucketName,
        Policy: JSON.stringify(policy)
      }).promise();
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
        Metadata: sanitizedMetadata,
        ServerSideEncryption: 'AES256'
      };

      // Upload file
      const result = await s3.upload(uploadParams).promise();

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
      const downloadParams = {
        Bucket: bucketName,
        Key: fileKey
      };

      const result = await s3.getObject(downloadParams).promise();
      
      logger.info('File downloaded successfully', {
        bucket: bucketName,
        key: fileKey
      });

      return {
        body: result.Body,
        contentType: result.ContentType,
        contentLength: result.ContentLength,
        lastModified: result.LastModified,
        metadata: result.Metadata
      };
    } catch (error) {
      logger.error('File download failed:', error);
      throw error;
    }
  }

  async getFileInfo(bucketName, fileKey) {
    try {
      const headParams = {
        Bucket: bucketName,
        Key: fileKey
      };

      const result = await s3.headObject(headParams).promise();
      
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

      await s3.deleteObject(deleteParams).promise();
      
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

      const result = await s3.listObjectsV2(listParams).promise();
      
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
      const params = {
        Bucket: bucketName,
        Key: fileKey,
        Expires: expiry
      };

      const url = await s3.getSignedUrlPromise('getObject', params);
      
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
const storageService = new StorageService();

module.exports = {
  storageService,
  BUCKETS,
  ALLOWED_FILE_TYPES,
  MAX_FILE_SIZE
}; 