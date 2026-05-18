import { quizzesService } from './quizzes.service.js';

export const quizzesController = {
  getCourseQuiz: async (req, res) => {
    const result = await quizzesService.getQuizForStudent({
      user: req.user,
      courseId: req.params.courseId
    });

    res.status(200).json(result);
  },

  getLessonQuiz: async (req, res) => {
    const result = await quizzesService.getQuizForStudent({
      user: req.user,
      courseId: req.params.courseId,
      lessonId: req.params.lessonId
    });

    res.status(200).json(result);
  },

  startCourseQuizAttempt: async (req, res) => {
    const result = await quizzesService.startQuizAttempt({
      user: req.user,
      courseId: req.params.courseId
    });

    res.status(result.reusedExistingAttempt ? 200 : 201).json(result);
  },

  startLessonQuizAttempt: async (req, res) => {
    const result = await quizzesService.startQuizAttempt({
      user: req.user,
      courseId: req.params.courseId,
      lessonId: req.params.lessonId
    });

    res.status(result.reusedExistingAttempt ? 200 : 201).json(result);
  },

  submitQuizAttempt: async (req, res) => {
    const result = await quizzesService.submitQuizAttempt({
      user: req.user,
      attemptId: req.params.attemptId,
      answers: req.body?.answers
    });

    res.status(200).json(result);
  },

  getSubmittedAttemptResult: async (req, res) => {
    const result = await quizzesService.getSubmittedAttemptResult({
      user: req.user,
      attemptId: req.params.attemptId
    });

    res.status(200).json(result);
  }
};
