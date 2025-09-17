from qdrant_client import QdrantClient
from qdrant_client.models import (
    Distance, 
    VectorParams, 
    PointStruct,
    Filter,
    FieldCondition,
    MatchValue,
    SearchParams,
    UpdateStatus
)
from typing import List, Dict, Any, Optional
import uuid
import os
from dotenv import load_dotenv

load_dotenv()

class QdrantService:
    def __init__(self):
        self.client = QdrantClient(
            host=os.getenv("QDRANT_HOST", "localhost"),
            port=int(os.getenv("QDRANT_PORT", 6333))
        )
        self.collection_name = os.getenv("QDRANT_COLLECTION", "memory_palace")
        self.vector_size = 1536  # OpenAI embedding size
        self._ensure_collection()
    
    def _ensure_collection(self):
        """Create collection if it doesn't exist"""
        collections = self.client.get_collections().collections
        if not any(col.name == self.collection_name for col in collections):
            self.client.create_collection(
                collection_name=self.collection_name,
                vectors_config=VectorParams(
                    size=self.vector_size,
                    distance=Distance.COSINE
                )
            )
    
    def add_document(
        self, 
        embedding: List[float], 
        metadata: Dict[str, Any],
        document_id: Optional[str] = None
    ) -> str:
        """Add a document to the collection"""
        if not document_id:
            document_id = str(uuid.uuid4())
        
        point = PointStruct(
            id=document_id,
            vector=embedding,
            payload=metadata
        )
        
        self.client.upsert(
            collection_name=self.collection_name,
            points=[point]
        )
        
        return document_id
    
    def search(
        self,
        query_vector: List[float],
        limit: int = 10,
        score_threshold: Optional[float] = None,
        filter_dict: Optional[Dict[str, Any]] = None
    ) -> List[Dict[str, Any]]:
        """Search for similar documents"""
        search_params = SearchParams(
            hnsw_ef=128,
            exact=False
        )
        
        # Build filter if provided
        filter_obj = None
        if filter_dict:
            conditions = []
            for key, value in filter_dict.items():
                conditions.append(
                    FieldCondition(
                        key=key,
                        match=MatchValue(value=value)
                    )
                )
            if conditions:
                filter_obj = Filter(must=conditions)
        
        results = self.client.search(
            collection_name=self.collection_name,
            query_vector=query_vector,
            limit=limit,
            score_threshold=score_threshold,
            query_filter=filter_obj,
            search_params=search_params
        )
        
        return [
            {
                "id": str(hit.id),
                "score": hit.score,
                "metadata": hit.payload
            }
            for hit in results
        ]
    
    def get_all_documents(self, limit: int = 1000) -> List[Dict[str, Any]]:
        """Get all documents with their metadata"""
        results = self.client.scroll(
            collection_name=self.collection_name,
            limit=limit,
            with_vectors=True,
            with_payload=True
        )
        
        documents = []
        for point in results[0]:
            doc = {
                "id": str(point.id),
                "metadata": point.payload,
                "vector": point.vector
            }
            documents.append(doc)
        
        return documents
    
    def get_document(self, document_id: str) -> Optional[Dict[str, Any]]:
        """Get a specific document by ID"""
        results = self.client.retrieve(
            collection_name=self.collection_name,
            ids=[document_id],
            with_vectors=True,
            with_payload=True
        )
        
        if results:
            point = results[0]
            return {
                "id": str(point.id),
                "metadata": point.payload,
                "vector": point.vector
            }
        return None
    
    def update_document(
        self,
        document_id: str,
        metadata: Optional[Dict[str, Any]] = None,
        vector: Optional[List[float]] = None
    ) -> bool:
        """Update a document's metadata or vector"""
        if metadata:
            self.client.set_payload(
                collection_name=self.collection_name,
                payload=metadata,
                points=[document_id]
            )
        
        if vector:
            point = PointStruct(
                id=document_id,
                vector=vector,
                payload=metadata or {}
            )
            self.client.upsert(
                collection_name=self.collection_name,
                points=[point]
            )
        
        return True
    
    def delete_document(self, document_id: str) -> bool:
        """Delete a document from the collection"""
        result = self.client.delete(
            collection_name=self.collection_name,
            points_selector=[document_id]
        )
        return result.status == UpdateStatus.COMPLETED
    
    def get_collection_info(self) -> Dict[str, Any]:
        """Get collection statistics"""
        info = self.client.get_collection(self.collection_name)
        return {
            "vectors_count": info.vectors_count,
            "points_count": info.points_count,
            "indexed_vectors_count": info.indexed_vectors_count,
            "status": info.status,
            "config": {
                "vector_size": info.config.params.vectors.size,
                "distance": info.config.params.vectors.distance
            }
        }
    
    def find_connections(
        self,
        document_id: str,
        connection_threshold: float = 0.7,
        max_connections: int = 5
    ) -> List[Dict[str, Any]]:
        """Find strongly connected documents"""
        doc = self.get_document(document_id)
        if not doc:
            return []
        
        connections = self.search(
            query_vector=doc["vector"],
            limit=max_connections + 1,  # +1 because it will include itself
            score_threshold=connection_threshold
        )
        
        # Remove self from results
        return [conn for conn in connections if conn["id"] != document_id]

# Singleton instance
qdrant_service = QdrantService()