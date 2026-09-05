import os
import sys
import cv2
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)) + "/..")

def analyze_features():
    frame = cv2.imread("videos/frame.png")
    h, w = frame.shape[:2]
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)

    # 1. CLAHE enhanced gray
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    enhanced = clahe.apply(gray)

    # 2. Omnidirectional High Frequency Texture (Laplacian of Gaussian)
    blurred = cv2.GaussianBlur(enhanced, (3, 3), 0)
    laplacian = cv2.Laplacian(blurred, cv2.CV_32F, ksize=3)
    abs_lap = np.abs(laplacian)

    # 3. Local Standard Deviation (Crowd has high standard deviation of pixel values due to hair/clothes/skin contrast)
    mean, std = cv2.meanStdDev(gray)
    blur_sq = cv2.GaussianBlur(gray.astype(np.float32)**2, (25, 25), 0)
    sq_blur = cv2.GaussianBlur(gray.astype(np.float32), (25, 25), 0)**2
    local_std = np.sqrt(np.maximum(0, blur_sq - sq_blur))

    # 4. Sobel Gradients
    sobelx = cv2.Sobel(gray, cv2.CV_32F, 1, 0, ksize=3)
    sobely = cv2.Sobel(gray, cv2.CV_32F, 0, 1, ksize=3)
    grad_mag = np.sqrt(sobelx**2 + sobely**2)
    # Directional coherence: if edges are strictly parallel (like corrugated roof), ratio |sobelx| / (|sobelx| + |sobely|) is near 0 or 1
    # In crowds, gradients point in all directions equally (grad_dir is uniform)

    # 5. Color variance in local patch (roofs are monochromatic zinc/concrete, crowds have multicolored clothes)
    hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
    sat = hsv[:, :, 1].astype(np.float32)
    sat_blur = cv2.GaussianBlur(sat, (25, 25), 0)

    print(f"Laplacian max: {np.max(abs_lap):.1f}, mean: {np.mean(abs_lap):.1f}")
    print(f"Local std max: {np.max(local_std):.1f}, mean: {np.mean(local_std):.1f}")
    print(f"Grad mag max: {np.max(grad_mag):.1f}, mean: {np.mean(grad_mag):.1f}")

if __name__ == "__main__":
    analyze_features()
