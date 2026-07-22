export const COURSE_SERVICE_UNAVAILABLE_CODE = "COURSE_SERVICE_UNAVAILABLE" as const;

export type CourseServiceOperation =
  | "catalog"
  | "catalog-detail"
  | "course-detail"
  | "student-courses"
  | "student-course"
  | "student-lesson"
  | "student-dashboard"
  | "student-continue-learning";

export type CourseServiceUnavailableState = {
  code: typeof COURSE_SERVICE_UNAVAILABLE_CODE;
  status: 503;
  service: "course-backend";
  operation: CourseServiceOperation;
  retryable: true;
  message: string;
};

const defaultMessage = "Course data is temporarily unavailable.";

export function createCourseServiceUnavailableState(
  operation: CourseServiceOperation,
  message = defaultMessage,
): CourseServiceUnavailableState {
  return {
    code: COURSE_SERVICE_UNAVAILABLE_CODE,
    status: 503,
    service: "course-backend",
    operation,
    retryable: true,
    message,
  };
}

export class CourseServiceUnavailableError extends Error {
  readonly state: CourseServiceUnavailableState;

  constructor(
    operation: CourseServiceOperation,
    message = defaultMessage,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "CourseServiceUnavailableError";
    this.state = createCourseServiceUnavailableState(operation, message);
  }

  get code() {
    return this.state.code;
  }

  get status() {
    return this.state.status;
  }
}

export function isCourseServiceUnavailableError(
  error: unknown,
): error is CourseServiceUnavailableError {
  return error instanceof CourseServiceUnavailableError;
}

export function throwCourseServiceUnavailable(
  state: CourseServiceUnavailableState,
): never {
  throw new CourseServiceUnavailableError(state.operation, state.message);
}
