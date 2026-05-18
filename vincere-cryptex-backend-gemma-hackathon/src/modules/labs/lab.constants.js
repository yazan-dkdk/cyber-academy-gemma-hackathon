export const LabStatuses = Object.freeze({
  DRAFT: 'draft',
  PUBLISHED: 'published'
});

export const LabDifficulties = Object.freeze({
  EASY: 'easy',
  MEDIUM: 'medium',
  HARD: 'hard'
});

export const LabTypes = Object.freeze({
  CONTAINER: 'container'
});

export const LabInstanceStatuses = Object.freeze({
  STARTING: 'STARTING',
  ACTIVE: 'ACTIVE',
  EXPIRED: 'EXPIRED',
  TERMINATED: 'TERMINATED',
  ERROR: 'ERROR'
});

export const LiveLabInstanceStatuses = Object.freeze([
  LabInstanceStatuses.STARTING,
  LabInstanceStatuses.ACTIVE
]);

export const TerminableLabInstanceStatuses = Object.freeze([
  LabInstanceStatuses.STARTING,
  LabInstanceStatuses.ACTIVE,
  LabInstanceStatuses.EXPIRED,
  LabInstanceStatuses.ERROR
]);
