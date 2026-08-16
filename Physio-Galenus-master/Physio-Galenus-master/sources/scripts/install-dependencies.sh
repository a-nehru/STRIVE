#!/bin/sh

cd /opt/app/

cd backend
npm ci

cd ../frontend
npm ci
