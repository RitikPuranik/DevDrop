import { describe, it, expect } from 'vitest';
import { getListingIssue } from '../shared';

const err = (data) => ({ response: { data } });

describe('getListingIssue', () => {
  it('flags an unverified-email response distinctly from other errors', () => {
    const issue = getListingIssue(err({ requiresVerification: true }));
    expect(issue.tone).toBe('warning');
    expect(issue.title).toMatch(/verify your email/i);
  });

  it('flags a missing-bank-details response distinctly', () => {
    const issue = getListingIssue(err({ requiresBankDetails: true }));
    expect(issue.tone).toBe('warning');
    expect(issue.title).toMatch(/bank details/i);
  });

  it('maps field-level validation errors to human-readable labels', () => {
    const issue = getListingIssue(err({
      errors: [
        { field: 'price', message: 'must be a positive number' },
        { field: 'githubUrl', message: 'must be a valid GitHub URL' },
      ],
    }));
    expect(issue.tone).toBe('error');
    expect(issue.messages).toEqual([
      'Price: must be a positive number',
      'GitHub URL: must be a valid GitHub URL',
    ]);
  });

  it('falls back to the raw field name when no friendly label exists', () => {
    const issue = getListingIssue(err({ errors: [{ field: 'unknownField', message: 'is invalid' }] }));
    expect(issue.messages[0]).toBe('unknownField: is invalid');
  });

  it('gives a specific message for the free-price-must-be-0 business rule', () => {
    const issue = getListingIssue(err({ message: 'Free websites must have price 0' }));
    expect(issue.title).toMatch(/price needs to stay at 0/i);
  });

  it('gives a specific message for the paid-price-must-be-positive business rule', () => {
    const issue = getListingIssue(err({ message: 'Paid/exclusive websites must have price > 0' }));
    expect(issue.title).toMatch(/paid listings need a price/i);
  });

  it('surfaces a raw server error message when present and meaningful', () => {
    const issue = getListingIssue(err({ error: 'Storage quota exceeded' }));
    expect(issue.messages[0]).toBe('Storage quota exceeded');
  });

  it('falls back to a generic message when the server only says "Validation failed" with no detail', () => {
    const issue = getListingIssue(err({ message: 'Validation failed' }));
    expect(issue.messages[0]).toMatch(/something went wrong/i);
  });

  it('falls back to a generic message when there is no response data at all', () => {
    const issue = getListingIssue({ response: undefined });
    expect(issue.tone).toBe('error');
    expect(issue.messages[0]).toMatch(/something went wrong/i);
  });

  it('prioritizes field-level errors over a generic top-level message when both are present', () => {
    const issue = getListingIssue(err({
      message: 'Validation failed',
      errors: [{ field: 'name', message: 'is required' }],
    }));
    expect(issue.title).toBe('Please fix these fields');
  });
});
