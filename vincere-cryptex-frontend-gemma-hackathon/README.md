This is the Vincere Cryptex frontend, built with [Next.js](https://nextjs.org) App Router and wired to the NestJS backend auth service.

## Getting Started

1. Copy `.env.example` to `.env.local` and set the backend origin if needed.
2. Start the NestJS backend on `http://localhost:3000`.
3. Start the frontend development server:

```bash
npm run dev
```

The frontend runs on [http://localhost:3001](http://localhost:3001) so it can communicate with the backend on port `3000` using cookie-based sessions.

## Auth Integration

- Login, register, logout, forgot-password, reset-password, and `/me` all call the NestJS backend directly.
- Authentication relies on HttpOnly cookies only. No tokens are stored in local storage.
- Configure the backend base URL with `NEXT_PUBLIC_API_BASE_URL` when it is not `http://localhost:3000`.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!
