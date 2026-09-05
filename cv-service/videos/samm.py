import cv2

cap = cv2.VideoCapture(r"C:\Users\ELCOT\Downloads\20201541-uhd_3840_2160_30fps.mp4")
cap.set(cv2.CAP_PROP_POS_FRAMES, 1)  # change 100 to the frame number you want
ret, frame = cap.read()
cv2.imwrite("frame.png", frame) if ret else print("Couldn't read that frame")
cap.release()