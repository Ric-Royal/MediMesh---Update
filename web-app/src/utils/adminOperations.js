const PASSWORD_GROUPS = [
  'ABCDEFGHJKLMNPQRSTUVWXYZ',
  'abcdefghijkmnopqrstuvwxyz',
  '23456789',
  '!@#$%*_-',
];

const PASSWORD_CHARACTERS = PASSWORD_GROUPS.join('');

const secureRandomIndex = (maximum) => {
  const cryptoApi = window.crypto;
  if (!cryptoApi?.getRandomValues) {
    throw new Error('Secure password generation is not available in this browser');
  }

  const values = new Uint32Array(1);
  cryptoApi.getRandomValues(values);
  return values[0] % maximum;
};

export const SOLO_OPERATOR_ROLES = [
  'doctor',
  'nurse',
  'receptionist',
  'lab-tech',
  'pharmacist',
  'billing',
  'radiologist',
  'radiographer',
];

export const generateTemporaryPassword = (length = 16, randomIndex = secureRandomIndex) => {
  const safeLength = Math.max(12, Number(length) || 16);
  const password = PASSWORD_GROUPS.map(group => group[randomIndex(group.length)]);

  while (password.length < safeLength) {
    password.push(PASSWORD_CHARACTERS[randomIndex(PASSWORD_CHARACTERS.length)]);
  }

  for (let index = password.length - 1; index > 0; index -= 1) {
    const swapIndex = randomIndex(index + 1);
    [password[index], password[swapIndex]] = [password[swapIndex], password[index]];
  }

  return password.join('');
};

export const isStrongPassword = (password = '') => (
  password.length >= 12 &&
  /[A-Z]/.test(password) &&
  /[a-z]/.test(password) &&
  /[0-9]/.test(password) &&
  /[^A-Za-z0-9\s]/.test(password)
);

export const filterCatalogRows = (rows, query, searchableKeys = []) => {
  const normalizedQuery = String(query || '').trim().toLocaleLowerCase();
  if (!normalizedQuery) return rows;

  return rows.filter(row => searchableKeys.some(key => (
    String(row?.[key] ?? '').toLocaleLowerCase().includes(normalizedQuery)
  )));
};

export const formatCurrency = (amount, currency = 'KES') => {
  const numericAmount = Number(amount || 0);
  const normalizedCurrency = String(currency || 'KES').trim().toUpperCase();

  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: normalizedCurrency,
      maximumFractionDigits: 2,
    }).format(numericAmount);
  } catch (error) {
    return `${normalizedCurrency} ${numericAmount.toLocaleString()}`;
  }
};

export const catalogFieldLabel = (label, key, currency = 'KES') => (
  ['unit_price', 'selling_price', 'price'].includes(key)
    ? `${label} (${String(currency || 'KES').toUpperCase()})`
    : label
);
