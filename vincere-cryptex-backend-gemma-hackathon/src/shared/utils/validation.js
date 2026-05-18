import isEmail from 'validator/lib/isEmail.js';

const EMAIL_MAX_LENGTH = 254;

export const normalizeEmail = (email) => {
  if (typeof email !== 'string') {
    return '';
  }

  return email.trim().toLowerCase();
};

export const validateEmail = (email) => {
  const normalizedEmail = normalizeEmail(email);

  if (!normalizedEmail || normalizedEmail.length > EMAIL_MAX_LENGTH) {
    return false;
  }

  return isEmail(normalizedEmail, {
    allow_display_name: false,
    allow_utf8_local_part: false,
    domain_specific_validation: true,
    ignore_max_length: false,
    require_tld: true
  });
};
