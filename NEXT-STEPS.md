# Next Steps to Complete the Workout Log App

The core foundation of the Workout Log app has been built! Here's what you need to do to get it fully functional:

## ✅ Completed

- [x] Project setup with React + TypeScript + Vite
- [x] Tailwind CSS v4 configuration
- [x] Supabase client integration
- [x] IndexedDB setup for offline storage
- [x] Authentication with Google OAuth (UI ready)
- [x] Zustand state management
- [x] Offline sync queue implementation
- [x] Sign-in page
- [x] First-run setup flow
- [x] Today page (main workout screen)
- [x] Set logging panel with stack picker
- [x] Category and exercise data structures
- [x] PWA configuration
- [x] Environment variables configured

## 🔨 Required: Database Setup

### 1. Run the SQL Schema

You MUST run the database schema before the app will work:

1. Open your Supabase project: https://supabase.com/dashboard/project/qemwmivqzahsnxemjtvz
2. Go to **SQL Editor**
3. Click **New query**
4. Copy the entire contents of `supabase-schema.sql`
5. Paste and click **Run**

This creates:
- `categories` table
- `exercises` table
- `sessions` table
- `sets` table
- Row-Level Security policies
- Necessary indexes

### 2. Configure Google OAuth

1. In Supabase dashboard: **Authentication** → **Providers**
2. Enable **Google** provider
3. Follow the setup wizard:
   - Create a Google Cloud Console project
   - Enable Google+ API
   - Create OAuth 2.0 credentials
   - Add the Supabase redirect URI
4. Copy Client ID and Secret into Supabase

### 3. Create PWA Icons

Create two PNG icon files:

**public/icon-192.png** - 192×192 pixels
**public/icon-512.png** - 512×512 pixels

Quick options:
- Use [Favicon.io](https://favicon.io) to generate from text or emoji
- Design in Figma/Canva and export
- Use a fitness emoji (💪) and screenshot at high resolution

## 🚀 Running the App

```bash
# Development
npm run dev

# Open http://localhost:5173
```

The app should now:
1. Show the sign-in screen
2. Allow you to sign in with Google
3. Prompt for first-run setup (category selection)
4. Show the Today screen with your exercises

## 🧪 Testing Checklist

### Basic Functionality
- [ ] Sign in with Google works
- [ ] First-run setup creates categories
- [ ] Can add exercises to categories
- [ ] Set logging panel opens when tapping exercise
- [ ] Weight picker shows default weights (5-100kg)
- [ ] Can adjust reps with +/- buttons
- [ ] "Add Set" button creates a set
- [ ] Today's sets appear in the list
- [ ] Can delete a set
- [ ] "Finish Session" clears the session

### Offline Functionality
- [ ] Open DevTools → Application → Service Workers
- [ ] Check "Offline" checkbox
- [ ] Refresh page - app still loads
- [ ] Log some sets while offline
- [ ] Yellow "pending sync" indicator appears
- [ ] Uncheck "Offline"
- [ ] Wait ~30 seconds or switch tabs
- [ ] Indicator disappears
- [ ] Check Supabase table editor - sets should appear

### Security (RLS)
- [ ] Sign in as User A, create some data
- [ ] Note a category ID from Network tab
- [ ] Sign out, sign in as User B
- [ ] DevTools console: try to fetch User A's category by ID
- [ ] Should return empty, not User A's data

## 📋 Features to Implement (Phase 5-8)

### Phase 5: Session Context & History
- [ ] Add body weight input to session
- [ ] Add sleep hours input
- [ ] Add sleep quality (1-10 with inline descriptions)
- [ ] Add energy level (1-10 with inline descriptions)
- [ ] Create History page (list of past sessions)
- [ ] Create session detail view (read-only past session)
- [ ] Create exercise detail page with weight progression chart
- [ ] Support back-dating sessions

### Phase 6: Excel Export
- [ ] Integrate SheetJS (`xlsx` package is already installed)
- [ ] Create export utility function
- [ ] Generate "Workout Log" sheet (summary format per PRD)
- [ ] Generate "Per-set Detail" sheet
- [ ] Add date range filter
- [ ] Add export button in Settings
- [ ] Test export with 0 sessions (headers only)
- [ ] Test export with 100+ exercises (warn at 150+)

### Phase 7: Equipment Management UI
- [ ] Create "Manage Equipment" page
- [ ] Implement drag-to-reorder for categories (@dnd-kit is installed)
- [ ] Implement drag-to-reorder for exercises within category
- [ ] Add edit category/exercise modals
- [ ] Add delete with confirmation showing cascade count
- [ ] Validate unique names

### Phase 8: Settings & Polish
- [ ] Create Settings page
- [ ] Add sign-out button
- [ ] Add app version info
- [ ] Add link to export
- [ ] Add navigation between pages (bottom tab bar?)
- [ ] Improve error handling and user feedback
- [ ] Add loading states
- [ ] Add empty states
- [ ] Polish mobile UX

## 🐛 Known Issues to Fix

1. **Dynamic imports warning**: SetLoggingPanel has ineffective dynamic imports for `db` and `sync` modules. Consider removing the dynamic imports.

2. **Missing navigation**: There's no way to navigate between pages yet. Need to add:
   - Bottom navigation bar
   - React Router or similar
   - Links to History, Manage Equipment, Settings

3. **No exercise creation UI**: Users can't add exercises yet after first-run setup. Need to add:
   - "Add Exercise" button on Today page
   - Exercise creation modal
   - Category selection dropdown

4. **No category management**: After first-run, users can't modify categories. Need the management UI from Phase 7.

5. **Missing icons**: PWA will fail to install without icon-192.png and icon-512.png.

## 📚 Documentation

- `README.md` - Main project documentation
- `README-SETUP.md` - Detailed setup guide
- `PRD.md` - Original product requirements (reference)
- `supabase-schema.sql` - Database schema to run
- `public/ICONS-README.md` - Icon creation guide

## 🎯 Priority Order

If you want to get a minimally functional app first:

1. ✅ Run SQL schema (CRITICAL - app won't work without this)
2. ✅ Set up Google OAuth (CRITICAL - can't sign in without this)
3. ✅ Create placeholder icons (prevents PWA install errors)
4. 🔨 Add exercise creation UI (can't add exercises after first-run)
5. 🔨 Fix navigation (stuck on Today page)
6. 🔨 Add History page (can't view past workouts)
7. 🔨 Add Settings page with sign-out
8. 🔨 Add equipment management
9. 🔨 Add Excel export
10. 🔨 Add progression charts

## 💡 Development Tips

- The dev server has hot reload - just save files to see changes
- Check browser console for errors
- Use React DevTools extension to inspect state
- Use Supabase dashboard → Table Editor to view data
- Use DevTools → Application → IndexedDB to view local data
- Use DevTools → Application → Service Workers to test offline

## 🚢 Deployment

Once basic functionality works:

```bash
# Build for production
npm run build

# Deploy to Vercel (easiest)
npm i -g vercel
vercel

# Or deploy to Netlify
npm i -g netlify-cli
netlify deploy --prod
```

Remember to:
- Add production URL to Supabase Auth settings
- Add production URL to Google OAuth redirect URIs
- Test sign-in on production

---

**You're 70% of the way there!** The hardest parts (offline sync, RLS, PWA setup) are done. The remaining work is mostly UI components and integration.
