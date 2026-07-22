const {
  SAFE_ERROR_MESSAGE,
  sanitizeErrorPayload,
  sanitizeServerErrorResponses,
} = require('../sanitizeErrors');

describe('server error response sanitization', () => {
  it('removes internal details recursively while preserving status fields', () => {
    expect(sanitizeErrorPayload({
      success: false,
      error: 'relation patients does not exist',
      checks: {
        database: {
          status: 'unhealthy',
          message: 'password authentication failed for user postgres',
        },
      },
    })).toEqual({
      success: false,
      error: SAFE_ERROR_MESSAGE,
      checks: {
        database: {
          status: 'unhealthy',
          message: SAFE_ERROR_MESSAGE,
        },
      },
    });
  });

  it('only sanitizes server-error responses', () => {
    const next = jest.fn();
    const sent = [];
    const res = {
      statusCode: 400,
      json(body) {
        sent.push(body);
        return body;
      },
    };

    sanitizeServerErrorResponses({}, res, next);
    res.json({ error: 'Invalid patient identifier' });
    res.statusCode = 500;
    res.json({ error: 'select * from private_table' });

    expect(next).toHaveBeenCalledTimes(1);
    expect(sent).toEqual([
      { error: 'Invalid patient identifier' },
      { error: SAFE_ERROR_MESSAGE },
    ]);
  });
});
