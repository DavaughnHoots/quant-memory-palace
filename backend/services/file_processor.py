import os
import io
import base64
import mimetypes
from typing import Dict, Any, Optional, List
from datetime import datetime
import hashlib
from pathlib import Path

# PDF processing
try:
    from pypdf import PdfReader
except ImportError:
    PdfReader = None

# Image processing
try:
    from PIL import Image
except ImportError:
    Image = None

# Audio processing placeholder
try:
    import whisper
except ImportError:
    whisper = None

class FileProcessor:
    def __init__(self, upload_path: str = "./uploads"):
        self.upload_path = Path(upload_path)
        self.upload_path.mkdir(exist_ok=True, parents=True)
        self.max_file_size = int(os.getenv("MAX_FILE_SIZE", 52428800))  # 50MB default
        
        # Supported file types
        self.supported_types = {
            "text": [".txt", ".md", ".csv", ".json", ".xml", ".html"],
            "pdf": [".pdf"],
            "image": [".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp"],
            "audio": [".mp3", ".wav", ".m4a", ".ogg", ".flac"],
            "video": [".mp4", ".avi", ".mov", ".webm"]
        }
    
    def get_file_type(self, filename: str) -> str:
        """Determine file type from extension"""
        ext = Path(filename).suffix.lower()
        
        for file_type, extensions in self.supported_types.items():
            if ext in extensions:
                return file_type
        
        return "unknown"
    
    def generate_file_id(self, content: bytes) -> str:
        """Generate unique ID for file content"""
        return hashlib.sha256(content).hexdigest()[:16]
    
    def save_file(self, content: bytes, filename: str) -> str:
        """Save file to upload directory"""
        file_id = self.generate_file_id(content)
        ext = Path(filename).suffix
        saved_filename = f"{file_id}{ext}"
        file_path = self.upload_path / saved_filename
        
        with open(file_path, "wb") as f:
            f.write(content)
        
        return str(file_path)
    
    def process_text_file(self, content: bytes, encoding: str = "utf-8") -> Dict[str, Any]:
        """Process plain text files"""
        try:
            text = content.decode(encoding)
        except UnicodeDecodeError:
            # Try different encodings
            for enc in ["latin-1", "cp1252", "utf-16"]:
                try:
                    text = content.decode(enc)
                    break
                except UnicodeDecodeError:
                    continue
            else:
                text = content.decode("utf-8", errors="ignore")
        
        # Extract some metadata
        lines = text.split("\n")
        word_count = len(text.split())
        char_count = len(text)
        
        # Create a clean preview by removing excessive whitespace
        preview_text = " ".join(text.split())[:1000]
        
        return {
            "content": text,
            "metadata": {
                "type": "text",
                "encoding": encoding,
                "lines": len(lines),
                "words": word_count,
                "characters": char_count,
                "preview": preview_text
            }
        }
    
    def process_pdf_file(self, content: bytes) -> Dict[str, Any]:
        """Process PDF files"""
        if not PdfReader:
            raise ImportError("pypdf is required for PDF processing")
        
        pdf_file = io.BytesIO(content)
        reader = PdfReader(pdf_file)
        
        # Extract text from all pages
        full_text = ""
        page_texts = []
        
        for i, page in enumerate(reader.pages):
            page_text = page.extract_text()
            page_texts.append(page_text)
            full_text += f"\n[Page {i+1}]\n{page_text}\n"
        
        # Create a clean preview by removing excessive whitespace
        preview_text = " ".join(full_text.split())[:1000]
        
        # Extract metadata
        metadata = {
            "type": "pdf",
            "pages": len(reader.pages),
            "encrypted": reader.is_encrypted,
            "preview": preview_text,
            "words": len(full_text.split())
        }
        
        # Try to get document info
        if reader.metadata:
            info = reader.metadata
            metadata.update({
                "title": str(info.get("/Title", "")) if info.get("/Title") else None,
                "author": str(info.get("/Author", "")) if info.get("/Author") else None,
                "subject": str(info.get("/Subject", "")) if info.get("/Subject") else None,
                "creator": str(info.get("/Creator", "")) if info.get("/Creator") else None,
                "producer": str(info.get("/Producer", "")) if info.get("/Producer") else None,
                "creation_date": str(info.get("/CreationDate", "")) if info.get("/CreationDate") else None,
            })
        
        return {
            "content": full_text.strip(),
            "metadata": metadata,
            "page_texts": page_texts
        }
    
    def process_image_file(self, content: bytes, filename: str) -> Dict[str, Any]:
        """Process image files"""
        if not Image:
            # If PIL is not available, just return basic info
            return {
                "content": f"Image file: {filename}",
                "metadata": {
                    "type": "image",
                    "filename": filename,
                    "size": len(content),
                    "note": "Image processing requires Pillow library"
                }
            }
        
        img_file = io.BytesIO(content)
        img = Image.open(img_file)
        
        # Extract metadata
        metadata = {
            "type": "image",
            "format": img.format,
            "mode": img.mode,
            "width": img.width,
            "height": img.height,
            "size": f"{img.width}x{img.height}"
        }
        
        # Get EXIF data if available
        if hasattr(img, "_getexif") and img._getexif():
            exif = img._getexif()
            metadata["has_exif"] = True
        
        # Generate base64 thumbnail
        thumbnail_size = (200, 200)
        img.thumbnail(thumbnail_size)
        thumb_io = io.BytesIO()
        img.save(thumb_io, format="PNG")
        thumb_b64 = base64.b64encode(thumb_io.getvalue()).decode()
        
        # Generate text description for embedding
        content_text = f"Image: {filename}\nFormat: {metadata['format']}\nSize: {metadata['size']}"
        
        # In production, you could use CLIP or another vision model here
        # to generate better embeddings
        
        return {
            "content": content_text,
            "metadata": metadata,
            "thumbnail": f"data:image/png;base64,{thumb_b64}"
        }
    
    def process_audio_file(self, content: bytes, filename: str) -> Dict[str, Any]:
        """Process audio files"""
        # Basic metadata without transcription
        metadata = {
            "type": "audio",
            "filename": filename,
            "size": len(content)
        }
        
        # If Whisper is available, transcribe
        if whisper:
            # Save temporarily for Whisper
            temp_path = self.upload_path / f"temp_{filename}"
            with open(temp_path, "wb") as f:
                f.write(content)
            
            try:
                model = whisper.load_model("base")
                result = model.transcribe(str(temp_path))
                transcription = result["text"]
                metadata["duration"] = result.get("duration")
                metadata["language"] = result.get("language")
                
                # Clean up temp file
                os.remove(temp_path)
                
                return {
                    "content": transcription,
                    "metadata": metadata
                }
            except Exception as e:
                # Clean up temp file
                if os.path.exists(temp_path):
                    os.remove(temp_path)
                metadata["transcription_error"] = str(e)
        
        # Without Whisper, just return basic info
        return {
            "content": f"Audio file: {filename} (transcription requires Whisper)",
            "metadata": metadata
        }
    
    def process_file(
        self,
        content: bytes,
        filename: str,
        content_type: Optional[str] = None
    ) -> Dict[str, Any]:
        """Main entry point for file processing"""
        # Check file size
        if len(content) > self.max_file_size:
            raise ValueError(f"File size exceeds maximum of {self.max_file_size} bytes")
        
        # Determine file type
        file_type = self.get_file_type(filename)
        
        # Save the original file
        saved_path = self.save_file(content, filename)
        
        # Process based on file type
        result = None
        
        if file_type == "text":
            result = self.process_text_file(content)
        elif file_type == "pdf":
            result = self.process_pdf_file(content)
        elif file_type == "image":
            result = self.process_image_file(content, filename)
        elif file_type == "audio":
            result = self.process_audio_file(content, filename)
        else:
            # Unknown file type - just store metadata
            result = {
                "content": f"File: {filename}",
                "metadata": {
                    "type": "unknown",
                    "filename": filename,
                    "size": len(content)
                }
            }
        
        # Add common metadata
        result["metadata"].update({
            "filename": filename,
            "file_path": saved_path,
            "file_size": len(content),
            "content_type": content_type or mimetypes.guess_type(filename)[0],
            "processed_at": datetime.utcnow().isoformat(),
            "file_id": self.generate_file_id(content)
        })
        
        return result
    
    def extract_chunks(
        self,
        content: str,
        chunk_size: int = 1000,
        overlap: int = 200
    ) -> List[str]:
        """Extract overlapping chunks from content"""
        if not content:
            return []
        
        words = content.split()
        chunks = []
        
        for i in range(0, len(words), chunk_size - overlap):
            chunk_words = words[i:i + chunk_size]
            chunk = " ".join(chunk_words)
            chunks.append(chunk)
        
        return chunks

# Singleton instance
file_processor = FileProcessor()