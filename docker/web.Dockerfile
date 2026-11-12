# Builds the Expo web app, then serves it (and proxies the API) with nginx.
# Build context is the repo root; see docker/compose.yml.

FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .

ARG EXPO_PUBLIC_SUPABASE_URL
ARG EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY
ARG EXPO_PUBLIC_SHARE_URL
ARG EXPO_PUBLIC_FACEBOOK_APP_ID
ARG EXPO_PUBLIC_TESTER_LOGIN
ENV EXPO_PUBLIC_SUPABASE_URL=$EXPO_PUBLIC_SUPABASE_URL \
    EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=$EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY \
    EXPO_PUBLIC_SHARE_URL=$EXPO_PUBLIC_SHARE_URL \
    EXPO_PUBLIC_FACEBOOK_APP_ID=$EXPO_PUBLIC_FACEBOOK_APP_ID \
    EXPO_PUBLIC_TESTER_LOGIN=$EXPO_PUBLIC_TESTER_LOGIN \
    NODE_ENV=production \
    NODE_OPTIONS=--max-old-space-size=3072
RUN npx expo export -p web --output-dir dist \
 && find dist -type f \( -name '*.js' -o -name '*.html' -o -name '*.css' -o -name '*.json' -o -name '*.svg' -o -name '*.ttf' \) \
      -exec gzip -9 -k {} \;

FROM nginx:1.29-alpine
LABEL tikkit=gateway
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY supabase/templates/ /usr/share/nginx/templates/
COPY --from=build /app/dist /usr/share/nginx/html
