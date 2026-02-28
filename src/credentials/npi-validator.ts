/**
 * NPI validator — verifies the format and Luhn check digit of a
 * National Provider Identifier.
 *
 * NPI is a 10-digit number. The first digit is the healthcare prefix
 * (always 1 or 2). The last digit is a Luhn check digit computed
 * over a prefix "80840" + the first 9 digits.
 *
 * Reference: CMS NPI Standard (45 CFR 162.406)
 */

/** Result from NPI validation. */
export interface NPIValidationResult {
  valid: boolean;
  npi?: string;
  reason?: string;
}

/**
 * Validate an NPI string for format and Luhn-10 check digit.
 *
 * @param npi - The NPI string to validate
 * @returns Validation result with reason on failure
 */
export function validateNPI(npi: string): NPIValidationResult {
  // Step 1: Must be a non-empty string
  if (typeof npi !== 'string' || npi.length === 0) {
    return { valid: false, reason: 'NPI must be a non-empty string' };
  }

  // Step 2: Must be exactly 10 digits
  if (!/^[0-9]{10}$/.test(npi)) {
    return { valid: false, reason: 'NPI must be exactly 10 digits' };
  }

  // Step 3: Luhn check
  // NPI uses a modified Luhn algorithm with prefix "80840" prepended
  // to the first 9 digits of the NPI, then the check digit (10th digit)
  // is validated against the Luhn formula.
  if (!luhnCheck(npi)) {
    return { valid: false, reason: 'NPI failed Luhn check digit validation' };
  }

  return { valid: true, npi };
}

/**
 * Luhn check for NPI — applies the CMS Luhn-10 algorithm.
 *
 * The algorithm prepends "80840" to the 10-digit NPI, then verifies
 * the complete 15-digit string passes the standard Luhn check.
 */
function luhnCheck(npi: string): boolean {
  // Prefix per CMS specification
  const prefixed = '80840' + npi;
  let sum = 0;

  // Process right to left, doubling every second digit from the right
  for (let i = prefixed.length - 1; i >= 0; i--) {
    let digit = parseInt(prefixed[i], 10);
    // Even positions from right (0-indexed from right, so odd index from left after reversal)
    // Standard Luhn: double every second digit starting from second-to-last
    const posFromRight = prefixed.length - 1 - i;
    if (posFromRight % 2 === 1) {
      digit *= 2;
      if (digit > 9) {
        digit -= 9;
      }
    }
    sum += digit;
  }

  return sum % 10 === 0;
}
