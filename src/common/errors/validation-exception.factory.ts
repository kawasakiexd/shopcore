import { DomainException } from './domain.exception.js';

type IssuePathSegment = PropertyKey | { key: PropertyKey };

type StandardIssue = {
  message: string;
  path?: readonly IssuePathSegment[];
};

function segmentToString(segment: IssuePathSegment): string {
  if (typeof segment === 'object' && segment !== null && 'key' in segment) {
    return String(segment.key);
  }
  return String(segment);
}

function issuePath(path: readonly IssuePathSegment[] | undefined): string {
  if (!path?.length) return '';
  return path.map(segmentToString).join('.');
}

export function createValidationException(issues: readonly StandardIssue[]): DomainException {
  return new DomainException('VALIDATION_FAILED', undefined, {
    errors: issues.map((issue) => ({
      path: issuePath(issue.path),
      message: issue.message,
    })),
  });
}
