FROM node:20-bookworm-slim

# Install Python 3, pip, build tools (for native C++ modules), and essential multimedia libs
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    build-essential \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 1. Install Node backend & frontend dependencies (compiles sqlite3 natively against Debian GLIBC)
COPY package.json ./
COPY backend/package*.json ./backend/
COPY frontend/package*.json ./frontend/

RUN npm install --prefix backend --build-from-source=sqlite3 && npm install --prefix frontend

# 2. Install lightweight Python dependencies for cached CV & dual-stream playback
RUN pip3 install --no-cache-dir --break-system-packages opencv-python-headless numpy requests python-dotenv

# 3. Copy full project code and assets
COPY . .

# 4. Build Vite React frontend
RUN npm run build --prefix frontend

# 5. Environment configuration
ENV NODE_ENV=production
ENV PORT=4000
ENV CCTV_USE_CACHE=true
ENV OVERRIDE_MODE=precomputed
ENV BACKEND_URL=http://localhost:4000/api/density
ENV ENABLE_OPTICAL_FLOW=true
ENV VIDEO_SOURCE_Z1=videos/crowd_1.mp4
ENV VIDEO_SOURCE_Z2=videos/crowd_5.mp4
ENV CAMERA_TYPE_Z1=cctv
ENV CAMERA_TYPE_Z2=drone
ENV AREA_SQM_Z1=30.0
ENV AREA_SQM_Z2=250.0

EXPOSE 4000

# 6. Start both CV dual-stream engine and Node.js Express server
CMD sh -c "python3 cv-service/main.py & node backend/src/index.js"
