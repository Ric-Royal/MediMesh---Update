const SENSITIVE_ERROR_KEY = /(error|message|stack|cause|detail)/i;
const SAFE_ERROR_MESSAGE = 'The server could not complete this request.';

function sanitizeErrorPayload(value) {
  if (Array.isArray(value)) {
    return value.map(sanitizeErrorPayload);
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      SENSITIVE_ERROR_KEY.test(key)
        ? SAFE_ERROR_MESSAGE
        : sanitizeErrorPayload(entry),
    ])
  );
}

function sanitizeServerErrorResponses(req, res, next) {
  const sendJson = res.json.bind(res);

  res.json = body => {
    if (res.statusCode >= 500) {
      return sendJson(sanitizeErrorPayload(body));
    }

    return sendJson(body);
  };

  next();
}

module.exports = {
  SAFE_ERROR_MESSAGE,
  sanitizeErrorPayload,
  sanitizeServerErrorResponses,
};
