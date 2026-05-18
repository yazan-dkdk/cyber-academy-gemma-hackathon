import { SetMetadata } from '@nestjs/common';

export const REQUIRE_ADMIN_MFA_KEY = 'require-admin-mfa';

export const RequireAdminMfa = () => SetMetadata(REQUIRE_ADMIN_MFA_KEY, true);
