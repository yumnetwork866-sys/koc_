export const getPaginationItems = (currentPage, totalPages, siblingCount = 1) => {
  const total = Math.max(1, Number(totalPages) || 1);
  const current = Math.min(total, Math.max(1, Number(currentPage) || 1));
  const visibleCount = siblingCount * 2 + 5;

  if (total <= visibleCount) {
    return Array.from({ length: total }, (_, index) => index + 1);
  }

  const left = Math.max(2, current - siblingCount);
  const right = Math.min(total - 1, current + siblingCount);
  const showLeftEllipsis = left > 2;
  const showRightEllipsis = right < total - 1;

  if (!showLeftEllipsis) {
    return [
      ...Array.from({ length: 3 + siblingCount * 2 }, (_, index) => index + 1),
      'ellipsis-right',
      total,
    ];
  }

  if (!showRightEllipsis) {
    const start = total - (2 + siblingCount * 2);
    return [
      1,
      'ellipsis-left',
      ...Array.from({ length: total - start + 1 }, (_, index) => start + index),
    ];
  }

  return [
    1,
    'ellipsis-left',
    ...Array.from({ length: right - left + 1 }, (_, index) => left + index),
    'ellipsis-right',
    total,
  ];
};
