export const printClinicalDocument = () => {
  if (typeof window === 'undefined' || typeof window.print !== 'function') {
    throw new Error('Printing is not available in this browser.');
  }

  document.body.classList.add('clinical-print-active');
  const cleanup = () => document.body.classList.remove('clinical-print-active');
  window.addEventListener('afterprint', cleanup, { once: true });
  window.print();
  window.setTimeout(cleanup, 1500);
};
