jest.mock('../../utils/database', () => ({ getDB: jest.fn() }));
jest.mock('../../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
}));

const { getDB } = require('../../utils/database');
const FileAttachment = require('../FileAttachment');

describe('FileAttachment storage schema compatibility', () => {
  beforeEach(() => jest.clearAllMocks());

  test('writes both legacy required columns and canonical storage columns', async () => {
    const key = 'system-files/550e8400-e29b-41d4-a716-446655440001/123-file.txt';
    const bucket = 'medimesh-system-files';
    const query = jest.fn().mockImplementation(async (sql, values) => ({
      rows: [{
        id: values[0],
        file_key: values[1],
        bucket_name: values[2],
        original_name: values[3],
        file_name: values[11],
        file_type: values[12],
        file_size: values[13],
        mime_type: values[14],
        storage_path: values[15],
        storage_bucket: values[16],
        storage_key: values[17],
        category: values[18],
        is_private: values[21],
        uploaded_by: values[22],
        is_active: true
      }]
    }));
    getDB.mockReturnValue({ query });

    const result = await FileAttachment.create({
      file_name: 'file.txt',
      file_type: 'text/plain',
      file_size: 4,
      mime_type: 'text/plain',
      storage_bucket: bucket,
      storage_key: key,
      category: 'system-files',
      uploaded_by: '550e8400-e29b-41d4-a716-446655440001'
    });

    const [sql, values] = query.mock.calls[0];
    expect(sql).toContain('file_key, bucket_name, original_name');
    expect(values.slice(1, 4)).toEqual([key, bucket, 'file.txt']);
    expect(values[16]).toBe(bucket);
    expect(values[17]).toBe(key);
    expect(result.storage_bucket).toBe(bucket);
    expect(result.storage_key).toBe(key);
  });

  test('reads legacy-only rows through canonical storage properties', () => {
    const record = new FileAttachment({
      id: '1d38f79b-0f67-48b0-8868-918eae24976e',
      file_key: 'system-files/user/file.txt',
      bucket_name: 'medimesh-system-files',
      original_name: 'file.txt'
    });

    expect(record.storage_key).toBe('system-files/user/file.txt');
    expect(record.storage_bucket).toBe('medimesh-system-files');
    expect(record.file_name).toBe('file.txt');
  });
});
