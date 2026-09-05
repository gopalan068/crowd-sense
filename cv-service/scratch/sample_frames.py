import cv2
import os

cap = cv2.VideoCapture("videos/crowd_5.mp4")
sample_indices = [0, 90, 180, 270, 360, 440]
for idx in sample_indices:
    cap.set(cv2.CAP_PROP_POS_FRAMES, idx)
    ret, frame = cap.read()
    if ret:
        cv2.imwrite(f"scratch/sample_frame_{idx}.jpg", frame)
        print(f"Saved scratch/sample_frame_{idx}.jpg")
cap.release()
