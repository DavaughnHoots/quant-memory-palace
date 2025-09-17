from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime
from enum import Enum

class FileType(str, Enum):
    TEXT = "text"
    PDF = "pdf"
    IMAGE = "image"
    AUDIO = "audio"
    VIDEO = "video"
    UNKNOWN = "unknown"

class Position3D(BaseModel):
    x: float = Field(..., description="X coordinate in 3D space")
    y: float = Field(..., description="Y coordinate in 3D space")
    z: float = Field(..., description="Z coordinate in 3D space")

class DocumentMetadata(BaseModel):
    title: Optional[str] = Field(None, description="Document title")
    description: Optional[str] = Field(None, description="Document description")
    filename: str = Field(..., description="Original filename")
    file_type: FileType = Field(..., description="Type of file")
    file_size: int = Field(..., description="File size in bytes")
    content_type: Optional[str] = Field(None, description="MIME type")
    tags: List[str] = Field(default_factory=list, description="Document tags")
    processed_at: datetime = Field(default_factory=datetime.utcnow)
    file_id: str = Field(..., description="Unique file identifier")
    
    # Additional metadata based on file type
    pages: Optional[int] = Field(None, description="Number of pages (for PDFs)")
    duration: Optional[float] = Field(None, description="Duration in seconds (for audio/video)")
    dimensions: Optional[Dict[str, int]] = Field(None, description="Image dimensions")
    word_count: Optional[int] = Field(None, description="Word count")
    language: Optional[str] = Field(None, description="Detected language")

class Document(BaseModel):
    id: str = Field(..., description="Document ID in vector database")
    metadata: DocumentMetadata
    position: Optional[Position3D] = Field(None, description="3D position in space")
    cluster: Optional[int] = Field(None, description="Cluster assignment")
    content_preview: Optional[str] = Field(None, description="Content preview")
    embedding_generated: bool = Field(True, description="Whether embedding was generated")
    
    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }

class UploadResponse(BaseModel):
    success: bool
    document_id: str
    message: str
    metadata: DocumentMetadata
    position: Optional[Position3D] = None

class SearchQuery(BaseModel):
    query: str = Field(..., description="Search query text")
    limit: int = Field(10, ge=1, le=100, description="Maximum number of results")
    threshold: float = Field(0.3, ge=0.0, le=1.0, description="Similarity threshold")
    filter_tags: Optional[List[str]] = Field(None, description="Filter by tags")
    filter_type: Optional[FileType] = Field(None, description="Filter by file type")
    include_content: bool = Field(False, description="Include content preview in results")

class SearchResult(BaseModel):
    document: Document
    score: float = Field(..., ge=0.0, le=1.0, description="Similarity score")
    highlights: Optional[List[str]] = Field(None, description="Highlighted snippets")

class SearchResponse(BaseModel):
    query: str
    results: List[SearchResult]
    count: int
    processing_time: float = Field(..., description="Search time in seconds")

class ClusterInfo(BaseModel):
    cluster_id: int
    center: Position3D
    size: int = Field(..., description="Number of documents in cluster")
    document_ids: List[str]
    label: Optional[str] = Field(None, description="Cluster label or theme")

class ClusterResponse(BaseModel):
    clusters: List[ClusterInfo]
    count: int
    method: str = Field("hdbscan", description="Clustering method used")

class Connection(BaseModel):
    source_id: str
    target_id: str
    strength: float = Field(..., ge=0.0, le=1.0, description="Connection strength")
    type: str = Field("similarity", description="Type of connection")

class SpatialLayoutResponse(BaseModel):
    documents: List[Document]
    clusters: List[ClusterInfo]
    connections: List[Connection]
    spread: float = Field(..., description="Document spread in 3D space")

class CollectionStats(BaseModel):
    total_documents: int
    total_clusters: int
    file_types: Dict[str, int]
    total_size: int = Field(..., description="Total size in bytes")
    average_similarity: Optional[float] = None
    last_updated: datetime

class ErrorResponse(BaseModel):
    error: str
    message: str
    status_code: int
    timestamp: datetime = Field(default_factory=datetime.utcnow)

class BatchUploadRequest(BaseModel):
    urls: Optional[List[str]] = Field(None, description="URLs to fetch and process")
    texts: Optional[List[Dict[str, str]]] = Field(None, description="Text documents to process")

class BatchUploadResponse(BaseModel):
    success: bool
    processed: int
    failed: int
    documents: List[UploadResponse]
    errors: List[Dict[str, str]] = Field(default_factory=list)

class DocumentUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    tags: Optional[List[str]] = None
    metadata_extra: Optional[Dict[str, Any]] = None

class DeleteResponse(BaseModel):
    success: bool
    message: str
    document_id: str

# Request/Response models for specific endpoints
class HealthCheck(BaseModel):
    status: str = "healthy"
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    services: Dict[str, bool] = Field(
        default_factory=lambda: {
            "qdrant": True,
            "openai": True,
            "file_processor": True
        }
    )

class SystemInfo(BaseModel):
    version: str = "1.0.0"
    python_version: str
    total_memory: int
    available_memory: int
    cpu_percent: float
    disk_usage: Dict[str, Any]