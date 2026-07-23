jest.mock('../logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
}));

const { StorageService, BUCKETS, bodyToBuffer, isNotFoundError } = require('../storage');

describe('AWS SDK v3 MinIO storage adapter', () => {
  test('recognizes v3 and legacy S3 not-found error shapes', () => {
    expect(isNotFoundError({ $metadata: { httpStatusCode: 404 } })).toBe(true);
    expect(isNotFoundError({ statusCode: 404 })).toBe(true);
    expect(isNotFoundError({ name: 'AccessDenied' })).toBe(false);
  });

  test('creates a missing bucket and applies its private policy with v3 commands', async () => {
    const client = {
      send: jest.fn()
        .mockRejectedValueOnce({ $metadata: { httpStatusCode: 404 } })
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({})
    };
    const service = new StorageService(client, { initializeBuckets: false });

    await service.createBucketIfNotExists(BUCKETS.medical_records);

    expect(client.send.mock.calls.map(([command]) => command.constructor.name)).toEqual([
      'HeadBucketCommand',
      'CreateBucketCommand',
      'PutBucketPolicyCommand'
    ]);
    expect(client.send.mock.calls[1][0].input.Bucket).toBe(BUCKETS.medical_records);
  });

  test('uploads through lib-storage while preserving MinIO parameters and metadata', async () => {
    const done = jest.fn().mockResolvedValue({
      Location: 'http://minio:9000/medimesh-medical-records/test-key',
      ETag: '"etag"'
    });
    const createUpload = jest.fn(() => ({ done }));
    const client = { send: jest.fn() };
    const service = new StorageService(client, {
      initializeBuckets: false,
      createUpload,
      serverSideEncryption: 'AES256'
    });
    const file = {
      originalname: 'clinical-note.pdf',
      mimetype: 'application/pdf',
      size: 4,
      buffer: Buffer.from('test')
    };

    const result = await service.uploadFile(
      file,
      'medical-records',
      '550e8400-e29b-41d4-a716-446655440001',
      { patient: 'Patient One' }
    );

    const uploadOptions = createUpload.mock.calls[0][0];
    expect(uploadOptions.client).toBe(client);
    expect(uploadOptions.leavePartsOnError).toBe(false);
    expect(uploadOptions.params).toMatchObject({
      Bucket: BUCKETS.medical_records,
      Body: file.buffer,
      ContentType: 'application/pdf',
      ServerSideEncryption: 'AES256'
    });
    expect(uploadOptions.params.Metadata.patient).toBe('Patient One');
    expect(done).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      bucket: BUCKETS.medical_records,
      url: 'http://minio:9000/medimesh-medical-records/test-key',
      etag: '"etag"'
    });
  });

  test('converts the v3 streaming response body back to a Buffer', async () => {
    const client = { send: jest.fn().mockResolvedValue({
      Body: Uint8Array.from([77, 101, 100, 105]),
      ContentType: 'text/plain',
      ContentLength: 4,
      Metadata: { kind: 'test' }
    }) };
    const service = new StorageService(client, { initializeBuckets: false });

    const result = await service.downloadFile(BUCKETS.system_files, 'test-key');

    expect(result.body).toEqual(Buffer.from('Medi'));
    expect(client.send.mock.calls[0][0].constructor.name).toBe('GetObjectCommand');
  });

  test('presigns a v3 GetObject command using expiresIn', async () => {
    const presign = jest.fn().mockResolvedValue('http://minio:9000/signed');
    const client = { send: jest.fn() };
    const service = new StorageService(client, {
      initializeBuckets: false,
      getSignedUrl: presign
    });

    const url = await service.generatePresignedUrl(BUCKETS.patient_documents, 'patient/file.pdf', 120);

    expect(url).toBe('http://minio:9000/signed');
    expect(presign.mock.calls[0][0]).toBe(client);
    expect(presign.mock.calls[0][1].constructor.name).toBe('GetObjectCommand');
    expect(presign.mock.calls[0][1].input).toEqual({
      Bucket: BUCKETS.patient_documents,
      Key: 'patient/file.pdf'
    });
    expect(presign.mock.calls[0][2]).toEqual({ expiresIn: 120 });
  });

  test('collects async iterable response bodies', async () => {
    async function* chunks() {
      yield Buffer.from('Medi');
      yield Uint8Array.from([77, 101, 115, 104]);
    }

    expect(await bodyToBuffer(chunks())).toEqual(Buffer.from('MediMesh'));
  });
});
