import {
  ArgumentMetadata,
  BadRequestException,
  Injectable,
  PipeTransform,
} from '@nestjs/common';

const MAX_OPAQUE_ID_LENGTH = 200;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001F\u007F]/;

@Injectable()
export class OpaqueIdParamPipe implements PipeTransform<unknown, string> {
  transform(value: unknown, metadata: ArgumentMetadata): string {
    const paramName = metadata.data ?? 'id';

    if (typeof value !== 'string') {
      throw new BadRequestException(`${paramName} must be a string`);
    }

    const normalized = value.trim();

    if (!normalized) {
      throw new BadRequestException(`${paramName} must be a non-empty string`);
    }

    if (normalized.length > MAX_OPAQUE_ID_LENGTH) {
      throw new BadRequestException(
        `${paramName} must be at most ${MAX_OPAQUE_ID_LENGTH} characters`,
      );
    }

    if (CONTROL_CHARACTER_PATTERN.test(normalized)) {
      throw new BadRequestException(`${paramName} contains invalid characters`);
    }

    return normalized;
  }
}
