import type { Course, CourseRole, User } from "../../lib/types";

export type CourseTabProps = {
  course: Course;
  role: CourseRole;
  user: User;
  refreshCourse: () => Promise<void>;
};

export function isStaff(role: CourseRole | undefined) {
  return role === "admin" || role === "teacher" || role === "ta";
}

export function isOwner(course: Course, role: CourseRole | undefined) {
  return role === "admin" || role === "teacher";
}
