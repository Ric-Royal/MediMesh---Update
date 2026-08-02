export const DEFAULT_BRAND_COLOR = '#1B6B93';
export const MINIMUM_NORMAL_TEXT_CONTRAST = 4.5;

const FULL_HEX_COLOR = /^#[0-9a-f]{6}$/i;

export const normalizeHexColor = (value) => (
  typeof value === 'string' && FULL_HEX_COLOR.test(value.trim())
    ? value.trim().toUpperCase()
    : null
);

const linearizeChannel = (channel) => {
  const value = channel / 255;
  return value <= 0.04045
    ? value / 12.92
    : ((value + 0.055) / 1.055) ** 2.4;
};

export const getRelativeLuminance = (color) => {
  const normalized = normalizeHexColor(color);
  if (!normalized) return null;

  const red = linearizeChannel(parseInt(normalized.slice(1, 3), 16));
  const green = linearizeChannel(parseInt(normalized.slice(3, 5), 16));
  const blue = linearizeChannel(parseInt(normalized.slice(5, 7), 16));

  return (0.2126 * red) + (0.7152 * green) + (0.0722 * blue);
};

export const getContrastRatio = (firstColor, secondColor) => {
  const firstLuminance = getRelativeLuminance(firstColor);
  const secondLuminance = getRelativeLuminance(secondColor);
  if (firstLuminance === null || secondLuminance === null) return 0;

  const lighter = Math.max(firstLuminance, secondLuminance);
  const darker = Math.min(firstLuminance, secondLuminance);
  return (lighter + 0.05) / (darker + 0.05);
};

export const getBrandColorValidationMessage = (value) => {
  if (!normalizeHexColor(value)) {
    return 'Use a six-digit hexadecimal colour, for example #1B6B93.';
  }

  if (getContrastRatio(value, '#FFFFFF') < MINIMUM_NORMAL_TEXT_CONTRAST) {
    return 'Choose a darker colour with at least 4.5:1 contrast against white text.';
  }

  return '';
};

export const getAccessibleBrandColor = (value, fallback = DEFAULT_BRAND_COLOR) => {
  if (!getBrandColorValidationMessage(value)) return normalizeHexColor(value);

  const normalizedFallback = normalizeHexColor(fallback);
  if (
    normalizedFallback
    && getContrastRatio(normalizedFallback, '#FFFFFF') >= MINIMUM_NORMAL_TEXT_CONTRAST
  ) {
    return normalizedFallback;
  }

  return DEFAULT_BRAND_COLOR;
};
