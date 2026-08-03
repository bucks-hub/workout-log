# Workout Log - Setup Instructions

A mobile-first Progressive Web App for tracking gym workouts with offline support.

## Prerequisites

- Node.js 18+ and npm
- A Supabase account (free tier works)

## Setup Steps

### 1. Install Dependencies

```bash
npm install
```

### 2. Set Up Supabase

1. Go to [supabase.com](https://supabase.com) and create a new project
2. Wait for the database to initialize (takes ~2 minutes)
3. Go to **SQL Editor** in the Supabase dashboard
4. Copy the contents of `supabase-schema.sql` and paste into a new query
5. Run the query to create tables, indexes, and RLS policies

### 3. Configure Google OAuth

1. In Supabase dashboard, go to **Authentication** → **Providers**
2. Enable **Google** provider
3. Follow Supabase's guide to:
   - Create a Google Cloud Console project
   - Enable Google+ API
   - Create OAuth 2.0 credentials
   - Add authorized redirect URIs (Supabase provides these)
4. Copy your Google Client ID and Secret into Supabase

### 4. Environment Variables

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```

2. Get your Supabase credentials:
   - Go to **Project Settings** → **API**
   - Copy the **Project URL** and **anon public** key

3. Update `.env`:
   ```
   VITE_SUPABASE_URL=https://your-project-id.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-key-here
   ```

### 5. Run Development Server

```bash
npm run dev
```

The app will open at `http://localhost:5173`

### 6. Test Offline Functionality

1. Sign in with Google
2. Create some categories and exercises
3. Open Chrome DevTools → Application → Service Workers
4. Check "Offline" to simulate no network
5. Refresh the page - the app should still work
6. Log some sets while offline
7. Uncheck "Offline" and watch them sync

### 7. Install as PWA (iOS Safari)

1. Open the app in Safari on iPhone
2. Tap the Share button
3. Tap "Add to Home Screen"
4. The app will open full-screen with no browser chrome

## Building for Production

```bash
npm run build
npm run preview  # Test the production build locally
```

Deploy the `dist` folder to any static hosting:
- Vercel
- Netlify
- Cloudflare Pages

**Important:** Make sure to:
1. Add your production URL to Supabase → Authentication → URL Configuration → Site URL
2. Add it to the redirect URLs in Google Cloud Console

## Project Structure

```
src/
  components/     # UI components (SetLoggingPanel, etc.)
  hooks/          # React hooks (useAuth)
  lib/            # Core libraries (supabase, db, sync)
  pages/          # Page components (SignIn, Today, etc.)
  store/          # Zustand state management
  types/          # TypeScript type definitions
  utils/          # Utility functions
```

## Key Features

- **Offline-first**: All writes go to IndexedDB immediately, sync when online
- **Google OAuth**: Secure authentication via Supabase Auth
- **Stack Picker**: Learn weight plates from user's history per exercise
- **Optimistic UI**: Instant feedback, no waiting for server
- **PWA**: Install to home screen, works like a native app
- **Excel Export**: Download full history (coming soon)

## Troubleshooting

### "Missing Supabase environment variables"
- Make sure `.env` file exists and has both variables set
- Restart the dev server after creating/editing `.env`

### Sign-in redirect fails
- Check that your site URL is added in Supabase → Authentication → URL Configuration
- For development, add `http://localhost:5173`

### RLS Policy Errors
- Make sure you ran the complete `supabase-schema.sql` file
- Check Supabase → Table Editor → each table should show a lock icon (RLS enabled)

### Service Worker Not Registering
- Service workers require HTTPS (or localhost)
- Check browser console for errors
- Try clearing browser cache and reloading

## Next Steps

See the full PRD in `PRD.md` for:
- Remaining features to implement (Excel export, history views, exercise charts)
- Edge cases to handle
- Acceptance criteria
