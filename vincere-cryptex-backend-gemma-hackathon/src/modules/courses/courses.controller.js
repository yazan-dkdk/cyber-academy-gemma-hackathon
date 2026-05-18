import { coursesService } from './courses.service.js';

export const coursesController = {
  listPublishedCourses: async (req, res) => {
    const result = await coursesService.listPublishedCourses(req.query);
    res.status(200).json(result);
  },

  getPublishedCourseDetails: async (req, res) => {
    const course = await coursesService.getPublishedCourseDetails(req.params.courseId);
    res.status(200).json({ course });
  },

  enrollInCourse: async (req, res) => {
    const result = await coursesService.enrollInCourse({
      user: req.user,
      courseId: req.params.courseId
    });

    res.status(result.alreadyEnrolled ? 200 : 201).json(result);
  },

  getLessonDetails: async (req, res) => {
    const result = await coursesService.getLessonDetails({
      user: req.user,
      courseId: req.params.courseId,
      lessonId: req.params.lessonId
    });

    res.status(200).json(result);
  },

  completeLesson: async (req, res) => {
    const result = await coursesService.completeLesson({
      user: req.user,
      courseId: req.params.courseId,
      lessonId: req.params.lessonId
    });

    res.status(200).json(result);
  }
};
