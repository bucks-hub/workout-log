# Workout Log

A mobile-first Progressive Web App for tracking gym workouts with offline-first architecture. Built with React, TypeScript, Supabase, and Tailwind CSS.

## Features

- ✅ **Offline-first**: Works completely offline, syncs when online
- ✅ **Google OAuth**: Secure authentication via Supabase
- ✅ **Smart weight picker**: Learns from your history per exercise
- ✅ **One-tap logging**: Consecutive identical sets = 1 tap each
- ✅ **PWA**: Install to home screen on iOS/Android
- ✅ **Category management**: Organize exercises by muscle group
- 🚧 **Excel export**: Full history export (to be implemented)
- 🚧 **Progress charts**: Weight progression over time (to be implemented)
- 🚧 **History view**: Browse past sessions (to be implemented)

## Quick Start

### 1. Clone and Install

```bash
cd workout-log
npm install
```

### 2. Set Up Supabase

1. Go to [supabase.com](https://supabase.com) and create a new project
2. Wait for the database to initialize (~2 minutes)
3. Go to **SQL Editor** → **New query**
4. Copy and paste the contents of `supabase-schema.sql`
5. Click **Run** to create the database schema

### 3. Configure Google OAuth

1. In Supabase dashboard: **Authentication** → **Providers**
2. Enable **Google** provider
3. Create Google OAuth credentials:
   - Go to [Google Cloud Console](https://console.cloud.google.com)
   - Create a new project or select existing
   - Enable Google+ API
   - Create OAuth 2.0 credentials (Web application)
   - Add Supabase redirect URI (shown in Supabase)
4. Paste Client ID and Secret into Supabase

### 4. Environment Variables

```bash
cp .env.example .env
```

Get your Supabase credentials from **Project Settings** → **API**:

```env
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

### 5. Run Development Server

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173)

### 6. Create PWA Icons

You need two icon files in the `public` folder:
- `icon-192.png` (192×192px)
- `icon-512.png` (512×512px)

Use [Favicon.io](https://favicon.io) or similar tools to generate icons.

## Usage

### First Time Setup

1. Sign in with Google
2. Select muscle group categories (or skip)
3. Add your first exercise

### Logging a Workout

1. Open the app (or tap on home screen if installed as PWA)
2. Tap an exercise to open the logging panel
3. Select weight from the stack picker (swipe horizontally)
4. Adjust reps with +/− buttons
5. Tap "Add Set"
6. Repeat for each set
7. Tap "Finish Session" when done

### Offline Usage

The app works completely offline:
- All exercises and categories are cached locally
- Sets are logged to IndexedDB immediately
- Automatic sync when connection returns
- Yellow indicator shows pending sync count

## Project Structure

```
src/
  components/       # React components
    SetLoggingPanel.tsx  # Core set logging UI
  hooks/            # Custom hooks
    useAuth.tsx     # Authentication
  lib/              # Core functionality
    db.ts           # IndexedDB operations
    supabase.ts     # Supabase client
    sync.ts         # Offline sync logic
  pages/            # Page components
    SignIn.tsx      # Authentication screen
    FirstRunSetup.tsx   # Onboarding
    Today.tsx       # Main workout screen
  store/            # State management
    useStore.ts     # Zustand store
  types/            # TypeScript types
    database.ts     # Database schemas
  utils/            # Utility functions
    date.ts         # Date formatting
```

## Technology Stack

- **Frontend**: React 18 + TypeScript + Vite
- **Styling**: Tailwind CSS v4
- **Backend**: Supabase (PostgreSQL + Auth + RLS)
- **State**: Zustand
- **Offline**: IndexedDB (via idb)
- **PWA**: vite-plugin-pwa
- **Excel**: SheetJS (to be integrated)
- **Charts**: Recharts (to be integrated)

## Deployment

### Build for Production

```bash
npm run build
```

This creates a `dist` folder with optimized static files.

### Deploy to Vercel

```bash
npm i -g vercel
vercel
```

### Deploy to Netlify

```bash
npm i -g netlify-cli
netlify deploy --prod
```

### Post-Deployment

1. Add your production URL to Supabase:
   - **Authentication** → **URL Configuration** → **Site URL**
   - Add to **Redirect URLs**
2. Update Google Cloud Console OAuth redirect URIs
3. Test sign-in on production URL

## Development Roadmap

Based on the PRD (`PRD.md`), remaining features to implement:

### Phase 5: Session Context & History
- [ ] Body weight, sleep hours, sleep quality, energy inputs
- [ ] History list (past sessions)
- [ ] Exercise detail view with progression chart
- [ ] Back-dating sessions

### Phase 6: Excel Export
- [ ] SheetJS integration
- [ ] "Workout Log" sheet (summary view)
- [ ] "Per-set Detail" sheet (raw data)
- [ ] Date range filter
- [ ] Download as `.xlsx`

### Phase 7: Equipment Management UI
- [ ] Drag-to-reorder categories
- [ ] Drag-to-reorder exercises within category
- [ ] Edit/delete with confirmation
- [ ] Cascade delete warnings

### Phase 8: Settings & Polish
- [ ] Settings page
- [ ] Sign out button
- [ ] Export from settings
- [ ] App version/info
- [ ] Privacy policy link

## Testing

### RLS Security Test

Critical: Verify that users cannot access each other's data.

1. Sign in as User A, create some data
2. Note a category/exercise ID from the browser DevTools → Network
3. Sign out and sign in as User B
4. Open DevTools → Console
5. Try to read User A's data:

```javascript
const { data, error } = await supabase
  .from('categories')
  .select('*')
  .eq('id', 'user-a-category-id')

// Should return empty data, not User A's category
```

### Offline Test

1. Sign in and create data
2. DevTools → Application → Service Workers → Offline
3. Refresh page - should still work
4. Log sets while offline
5. DevTools → Application → IndexedDB → workout-log → syncQueue
6. Verify items in queue
7. Uncheck Offline
8. Wait 30 seconds or trigger visibility change
9. Check Supabase table editor - sets should appear

## Troubleshooting

### Build fails with PostCSS error

Ensure you have the correct Tailwind PostCSS plugin:
```bash
npm install -D @tailwindcss/postcss
```

### Service Worker not updating

Clear browser cache or use DevTools → Application → Service Workers → Update on reload

### Sync not working

Check browser console for errors. Ensure:
- Supabase URL and key are correct
- User is authenticated
- RLS policies are enabled

### TypeScript errors

Make sure type imports use `import type`:
```typescript
import type { User } from '@supabase/supabase-js'
```

## License

MIT

## Contributing

This is an implementation of the PRD in `PRD.md`. Contributions welcome for:
- Remaining features from the roadmap
- Bug fixes
- Performance improvements
- UI/UX enhancements

See `README-SETUP.md` for detailed setup instructions.
