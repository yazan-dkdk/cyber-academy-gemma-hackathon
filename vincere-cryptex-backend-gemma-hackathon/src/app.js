import cookieParser from 'cookie-parser';
import express from 'express';
import helmet from 'helmet';
import { env } from './config/env.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { challengesRouter } from './modules/challenges/challenges.routes.js';
import { coursesRouter } from './modules/courses/courses.routes.js';
import { labsRouter } from './modules/labs/labs.routes.js';
import { quizzesRouter } from './modules/quizzes/quizzes.routes.js';
import { usersRouter } from './modules/users/users.routes.js';
import { errorHandler } from './shared/middleware/error-handler.middleware.js';
import { notFoundHandler } from './shared/middleware/not-found.middleware.js';
import { sessionMiddleware } from './shared/middleware/session.middleware.js';

export const createApp = () => {
  const app = express();

  if (env.trustProxy) {
    app.set('trust proxy', 1);
  }

  app.use(helmet());
  app.use(express.json());
  app.use(cookieParser(env.sessionSecret));
  app.use(sessionMiddleware);

  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  app.use('/api/v1/auth', authRouter);
  app.use('/api/v1/challenges', challengesRouter);
  app.use('/api/v1/labs', labsRouter);
  app.use('/api/v1', quizzesRouter);
  app.use('/api/v1/courses', coursesRouter);
  app.use('/api/v1/admin/users', usersRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
};
