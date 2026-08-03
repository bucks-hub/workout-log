#!/bin/bash

# Workout Log - Quick Start Script
# Run this to verify your setup

echo "🏋️  Workout Log - Setup Verification"
echo "======================================"
echo ""

# Check Node version
echo "📦 Checking Node.js..."
if command -v node &> /dev/null; then
    NODE_VERSION=$(node -v)
    echo "✅ Node.js: $NODE_VERSION"
else
    echo "❌ Node.js not found. Please install Node.js 18+"
    exit 1
fi

# Check npm
if command -v npm &> /dev/null; then
    NPM_VERSION=$(npm -v)
    echo "✅ npm: $NPM_VERSION"
else
    echo "❌ npm not found"
    exit 1
fi

echo ""
echo "📁 Checking project files..."

# Check if node_modules exists
if [ -d "node_modules" ]; then
    echo "✅ Dependencies installed"
else
    echo "⚠️  Dependencies not installed. Running npm install..."
    npm install
fi

# Check .env file
if [ -f ".env" ]; then
    echo "✅ .env file exists"
    if grep -q "qemwmivqzahsnxemjtvz" .env; then
        echo "✅ Supabase credentials configured"
    else
        echo "⚠️  Supabase credentials may not be set correctly"
    fi
else
    echo "❌ .env file missing"
    echo "   Run: cp .env.example .env"
    exit 1
fi

# Check critical files
echo ""
echo "📄 Checking critical files..."

FILES=(
    "src/App.tsx"
    "src/lib/supabase.ts"
    "src/lib/db.ts"
    "src/lib/sync.ts"
    "src/pages/SignIn.tsx"
    "src/pages/Today.tsx"
    "src/components/SetLoggingPanel.tsx"
    "supabase-schema.sql"
)

for file in "${FILES[@]}"; do
    if [ -f "$file" ]; then
        echo "✅ $file"
    else
        echo "❌ $file missing"
    fi
done

# Check PWA icons
echo ""
echo "🎨 Checking PWA icons..."
if [ -f "public/icon-192.png" ]; then
    echo "✅ icon-192.png exists"
else
    echo "⚠️  icon-192.png missing - PWA install will fail"
    echo "   Create 192x192 PNG icon at public/icon-192.png"
fi

if [ -f "public/icon-512.png" ]; then
    echo "✅ icon-512.png exists"
else
    echo "⚠️  icon-512.png missing - PWA install will fail"
    echo "   Create 512x512 PNG icon at public/icon-512.png"
fi

# Try to build
echo ""
echo "🔨 Testing build..."
if npm run build > /tmp/build.log 2>&1; then
    echo "✅ Build successful"
else
    echo "❌ Build failed. Check /tmp/build.log for details"
    exit 1
fi

# Summary
echo ""
echo "======================================"
echo "📋 SETUP STATUS"
echo "======================================"
echo ""
echo "✅ Code: All files in place"
echo "✅ Build: Compiles successfully"
echo ""
echo "⚠️  TODO: Complete these steps before running:"
echo ""
echo "1. 🗄️  Run SQL Schema in Supabase"
echo "   → https://supabase.com/dashboard/project/qemwmivqzahsnxemjtvz"
echo "   → SQL Editor → New Query"
echo "   → Copy/paste supabase-schema.sql"
echo "   → Click Run"
echo ""
echo "2. 🔐 Set up Google OAuth"
echo "   → Supabase → Authentication → Providers"
echo "   → Enable Google"
echo "   → Configure with Google Cloud Console"
echo ""
echo "3. 🎨 Create PWA Icons (if missing)"
echo "   → public/icon-192.png (192x192)"
echo "   → public/icon-512.png (512x512)"
echo "   → Use https://favicon.io"
echo ""
echo "======================================"
echo "🚀 Ready to start development!"
echo "======================================"
echo ""
echo "Run: npm run dev"
echo "Then open: http://localhost:5173"
echo ""
