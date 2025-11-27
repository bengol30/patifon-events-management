#!/bin/bash
echo "================================================"
echo "📋 משתני סביבה להעתקה ל-Vercel"
echo "================================================"
echo ""
echo "העתק כל שורה ל-Vercel Environment Variables:"
echo ""
grep "NEXT_PUBLIC_FIREBASE" .env.local | while IFS='=' read -r key value; do
    echo "שם: $key"
    echo "ערך: $value"
    echo "---"
done
echo ""
echo "⚠️  זכור לסמן Production + Preview + Development לכל משתנה!"
echo "================================================"
