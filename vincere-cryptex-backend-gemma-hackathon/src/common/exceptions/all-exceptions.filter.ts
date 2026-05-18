import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { FastifyReply, FastifyRequest } from 'fastify';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const reply = ctx.getResponse<FastifyReply>();
    const request = ctx.getRequest<FastifyRequest>();

    const { statusCode, body } = this.resolveError(exception);

    if (statusCode >= 500) {
      this.logger.error(
        `${request.method} ${request.url} failed`,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    reply.status(statusCode).send({
      error: body,
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }

  private resolveError(exception: unknown) {
    if (exception instanceof HttpException) {
      const response = exception.getResponse();
      const body =
        typeof response === 'string'
          ? { message: response }
          : (response as Record<string, unknown>);

      return {
        statusCode: exception.getStatus(),
        body,
      };
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2002') {
        return {
          statusCode: HttpStatus.CONFLICT,
          body: {
            message: 'A unique constraint was violated',
            code: exception.code,
          },
        };
      }

      if (exception.code === 'P2003') {
        return {
          statusCode: HttpStatus.CONFLICT,
          body: {
            message: 'A related resource constraint prevented this operation',
            code: exception.code,
          },
        };
      }
    }

    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      body: {
        message: 'Internal server error',
      },
    };
  }
}
