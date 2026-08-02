export const getRemainingPrescriptionQuantity = (item = {}) => Math.max(
  0,
  Number(item.quantity || 0) - Number(item.quantity_dispensed || item.dispensed_quantity || 0)
);

export const getMaximumDispensableQuantity = (item = {}) => Math.min(
  getRemainingPrescriptionQuantity(item),
  Math.max(0, Number(item.current_stock || 0))
);

export const isDispenseQuantityValid = (item, quantity) => {
  const numericQuantity = Number(quantity);
  return Number.isInteger(numericQuantity)
    && numericQuantity > 0
    && numericQuantity <= getMaximumDispensableQuantity(item);
};
