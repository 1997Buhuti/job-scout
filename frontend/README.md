# @job-scout/frontend

Next.js app for Job Scout. From the repo root:

```bash
npm run dev:frontend
```

The app runs at [http://localhost:3001](http://localhost:3001). The API uses port 3000.

Edit `src/app/page.tsx` to change the home page.

## Amplify configuration (sign-in)

Sign-in needs `frontend/amplify_outputs.json`. This file is generated per developer and is gitignored, so it is never committed. Create it once:

1. Sign in to AWS: `aws login`. You need read access to the Amplify app in the Job Scout account.
2. Generate the file from the deployed backend, using the app ID and branch from the Amplify console:

   ```bash
   npm run amplify:outputs -- --app-id <amplify-app-id> --branch <branch>
   ```

   Run this from `frontend/`. To work on your own isolated backend instead, run `npm run amplify:sandbox`.

Until the file is generated, `predev` creates it from `amplify_outputs.example.json`. The example has placeholder values, so the sign-in page shows "No AmplifyContext available" until you complete step 2.
