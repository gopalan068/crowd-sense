This directory holds pretrained model weights.

  models/yolov8n.pt  — YOLOv8n pretrained on COCO (~6 MB)

To download:
  cd cv-service
  python download_model.py

The .pt file is small enough to commit to git. If you choose to commit it,
remove the `# models/*.pt` line from cv-service/.gitignore.
If you choose NOT to commit it, every team member must run download_model.py
on their machine before running the CV service.
