#!/usr/bin/env python3
"""
Memory Palace 3D - Universal Startup Script
Works on Windows, Linux, and WSL
"""

import subprocess
import time
import sys
import os
import platform
import signal
import webbrowser
from pathlib import Path

class MemoryPalaceRunner:
    def __init__(self):
        self.backend_process = None
        self.frontend_process = None
        self.base_dir = Path(__file__).parent
        self.backend_dir = self.base_dir / "backend"
        self.frontend_dir = self.base_dir / "frontend"

    def print_header(self):
        """Print welcome header"""
        print("=" * 55)
        print("       MEMORY PALACE 3D - STARTUP SCRIPT")
        print("=" * 55)
        print()

    def check_python(self):
        """Check if Python is properly installed"""
        try:
            version = sys.version_info
            print(f"✓ Python {version.major}.{version.minor}.{version.micro} detected")
            if version.major < 3 or (version.major == 3 and version.minor < 7):
                print("⚠ Warning: Python 3.7+ is recommended")
            return True
        except Exception as e:
            print(f"✗ Error checking Python version: {e}")
            return False

    def check_requirements(self):
        """Check if required packages are installed"""
        required = ['uvicorn', 'fastapi', 'qdrant-client']
        missing = []

        for package in required:
            try:
                __import__(package.replace('-', '_'))
                print(f"✓ {package} installed")
            except ImportError:
                print(f"✗ {package} not found")
                missing.append(package)

        if missing:
            print("\nInstalling missing packages...")
            subprocess.run([sys.executable, "-m", "pip", "install"] + missing)
            print("Installation complete!")

        return True

    def kill_existing_processes(self):
        """Kill processes on ports 8000 and 3000"""
        print("\n[0/3] Checking for existing processes...")

        if platform.system() == "Windows":
            # Windows commands
            for port in [8000, 3000]:
                try:
                    result = subprocess.run(
                        f'netstat -ano | findstr :{port}',
                        shell=True, capture_output=True, text=True
                    )
                    if result.stdout:
                        lines = result.stdout.strip().split('\n')
                        for line in lines:
                            if f':{port}' in line:
                                parts = line.split()
                                pid = parts[-1]
                                subprocess.run(f'taskkill /PID {pid} /F', shell=True, capture_output=True)
                                print(f"  Killed process on port {port}")
                except:
                    pass
        else:
            # Linux/Mac/WSL commands
            for port in [8000, 3000]:
                try:
                    result = subprocess.run(
                        f'lsof -t -i:{port}',
                        shell=True, capture_output=True, text=True
                    )
                    if result.stdout:
                        pid = result.stdout.strip()
                        subprocess.run(f'kill -9 {pid}', shell=True)
                        print(f"  Killed process on port {port}")
                except:
                    pass

    def start_backend(self):
        """Start the backend server"""
        print("\n[1/3] Starting Backend Server...")
        print("-" * 35)

        os.chdir(self.backend_dir)

        if platform.system() == "Windows":
            self.backend_process = subprocess.Popen(
                [sys.executable, "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"],
                creationflags=subprocess.CREATE_NEW_CONSOLE
            )
        else:
            self.backend_process = subprocess.Popen(
                [sys.executable, "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
            )

        print(f"  Backend PID: {self.backend_process.pid}")
        print("  Waiting for backend to initialize...")
        time.sleep(5)

    def start_frontend(self):
        """Start the frontend server"""
        print("\n[2/3] Starting Frontend Server...")
        print("-" * 35)

        os.chdir(self.frontend_dir)

        if platform.system() == "Windows":
            self.frontend_process = subprocess.Popen(
                [sys.executable, "-m", "http.server", "3000"],
                creationflags=subprocess.CREATE_NEW_CONSOLE
            )
        else:
            self.frontend_process = subprocess.Popen(
                [sys.executable, "-m", "http.server", "3000"]
            )

        print(f"  Frontend PID: {self.frontend_process.pid}")
        time.sleep(3)

    def open_browser(self):
        """Open the application in browser"""
        print("\n[3/3] Opening Browser...")
        print("-" * 35)

        try:
            webbrowser.open('http://localhost:3000')
            print("  Browser opened successfully")
        except:
            print("  Please open http://localhost:3000 manually")

    def print_success(self):
        """Print success message"""
        print("\n" + "=" * 55)
        print("    ALL SERVICES STARTED SUCCESSFULLY!")
        print("=" * 55)
        print("\nBackend API:  http://localhost:8000")
        print("Frontend UI:  http://localhost:3000")
        print("API Docs:     http://localhost:8000/docs")
        print("\nPress Ctrl+C to stop all servers")
        print("=" * 55)

    def cleanup(self, signum=None, frame=None):
        """Clean up and stop all processes"""
        print("\n\nStopping servers...")

        if self.backend_process:
            self.backend_process.terminate()
            print("  Backend stopped")

        if self.frontend_process:
            self.frontend_process.terminate()
            print("  Frontend stopped")

        # Kill any remaining processes on ports
        self.kill_existing_processes()

        print("\nServers stopped. Goodbye!")
        sys.exit(0)

    def run(self):
        """Main run method"""
        self.print_header()

        # Check Python
        if not self.check_python():
            print("Please install Python 3.7+")
            sys.exit(1)

        # Check and install requirements
        self.check_requirements()

        # Kill existing processes
        self.kill_existing_processes()

        # Register cleanup handler
        signal.signal(signal.SIGINT, self.cleanup)
        if platform.system() != "Windows":
            signal.signal(signal.SIGTERM, self.cleanup)

        try:
            # Start servers
            self.start_backend()
            self.start_frontend()
            self.open_browser()
            self.print_success()

            # Keep running
            while True:
                time.sleep(1)
                # Check if processes are still running
                if self.backend_process and self.backend_process.poll() is not None:
                    print("\n⚠ Backend server stopped unexpectedly!")
                    self.cleanup()
                if self.frontend_process and self.frontend_process.poll() is not None:
                    print("\n⚠ Frontend server stopped unexpectedly!")
                    self.cleanup()

        except KeyboardInterrupt:
            self.cleanup()
        except Exception as e:
            print(f"\nError: {e}")
            self.cleanup()

if __name__ == "__main__":
    runner = MemoryPalaceRunner()
    runner.run()