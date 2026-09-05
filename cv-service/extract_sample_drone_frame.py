"""
cv-service/extract_sample_drone_frame.py
Utility script to extract a high-res sample frame from drone video for image testing.
"""
import os
import cv2

def extract_frame():
    video_path = os.path.join("videos", "crowd_1.mp4")
    output_path = "sample_drone_test.jpg"

    if not os.path.exists(video_path):
        print(f"Video file not found at {video_path}")
        return None

    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        print(f"Failed to open video {video_path}")
        return None

    # Jump to frame 30 for a nice crowd shot
    cap.set(cv2.CAP_PROP_POS_FRAMES, 30)
    ret, frame = cap.read()
    cap.release()

    if ret and frame is not None:
        cv2.imwrite(output_path, frame)
        print(f"[Success] Extracted sample drone frame ({frame.shape[1]}x{frame.shape[0]}) -> {output_path}")
        return output_path
    else:
        print("Failed to read frame from video.")
        return None

if __name__ == "__main__":
    extract_frame()
