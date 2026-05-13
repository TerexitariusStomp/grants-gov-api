import os
print("Current working directory:", os.getcwd())
print("Files in current dir:", os.listdir("."))
print("Frontend dir:", os.path.abspath(os.path.join(os.getcwd(), "..", "..", "frontend")))
print("Exists:", os.path.exists(os.path.abspath(os.path.join(os.getcwd(), "..", "..", "frontend"))))