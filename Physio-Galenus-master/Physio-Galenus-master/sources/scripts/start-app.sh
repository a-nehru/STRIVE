#!/bin/sh

cd /opt/app/

cd backend
cp -u /opt/app/CHANGELOG.md /opt/app/backend/dist/ 2>/dev/null || true
npm run start:dev &

cd ../frontend
npm run start
