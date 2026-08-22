"""
cv-service/scratch/test_head_detector.py
Test script for Circular Head Detection (HoughCircles + Laplacian Peak Filter) on crowd_2.mp4
"""
import cv2
import numpy as np

video_path = "videos/crowd_2.mp4"
cap = cv2.VideoCapture(video_path)
ret, frame = cap.read()
cap.release()

if not ret:
    print("Error loading video frame")
    exit(1)

gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
clahe = cv2.createCLAHE(clipLimit=2.5, tileGridSize=(8, 8))
enhanced = clahe.apply(gray)

# Blur slightly to eliminate high-frequency texture noise
blurred = cv2.GaussianBlur(enhanced, (5, 5), 0)

# Circular Hough Transform to find round head structures
circles = cv2.HoughCircles(
    blurred,
    cv2.HOUGH_GRADIENT,
    dp=1.2,
    minDist=8,
    param1=40,
    param2=14,
    minRadius=3,
    maxRadius=16
)

count = 0
annotated = frame.copy()
if circles is not None:
    circles = np.uint16(np.around(circles))
    count = len(circles[0, :])
    for i in circles[0, :]:
        cx, cy, r = i[0], i[1], i[2]
        cv2.circle(annotated, (cx, cy), 3, (248, 189, 56), -1)
        cv2.circle(annotated, (cx, cy), r, (16, 185, 129), 1)

print(f"[Circular Head Detector] Detected {count} round head structures in crowd_2.mp4!")
cv2.imwrite("head_test_output.jpg", annotated)
