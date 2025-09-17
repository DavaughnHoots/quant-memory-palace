from openai import OpenAI
from typing import List, Dict, Any, Optional
import os
import tiktoken
from dotenv import load_dotenv
import hashlib
import json

load_dotenv()

class EmbeddingService:
    def __init__(self):
        self.client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
        self.model = os.getenv("EMBEDDING_MODEL", "text-embedding-3-small")
        self.encoding = tiktoken.encoding_for_model("gpt-3.5-turbo")
        self.max_tokens = 8191  # Max for text-embedding-3-small
        self._cache = {}  # Simple in-memory cache
    
    def _get_cache_key(self, text: str) -> str:
        """Generate cache key for text"""
        return hashlib.md5(text.encode()).hexdigest()
    
    def count_tokens(self, text: str) -> int:
        """Count tokens in text"""
        return len(self.encoding.encode(text))
    
    def chunk_text(self, text: str, chunk_size: int = 1000, overlap: int = 200) -> List[str]:
        """Split text into overlapping chunks"""
        tokens = self.encoding.encode(text)
        chunks = []
        
        for i in range(0, len(tokens), chunk_size - overlap):
            chunk_tokens = tokens[i:i + chunk_size]
            chunk_text = self.encoding.decode(chunk_tokens)
            chunks.append(chunk_text)
        
        return chunks
    
    def generate_embedding(self, text: str, use_cache: bool = True) -> List[float]:
        """Generate embedding for a single text"""
        if not text or not text.strip():
            raise ValueError("Text cannot be empty")
        
        # Check cache
        cache_key = self._get_cache_key(text)
        if use_cache and cache_key in self._cache:
            return self._cache[cache_key]
        
        # Truncate if too long
        if self.count_tokens(text) > self.max_tokens:
            tokens = self.encoding.encode(text)[:self.max_tokens]
            text = self.encoding.decode(tokens)
        
        try:
            response = self.client.embeddings.create(
                input=text,
                model=self.model
            )
            embedding = response.data[0].embedding
            
            # Cache the result
            if use_cache:
                self._cache[cache_key] = embedding
            
            return embedding
        
        except Exception as e:
            raise Exception(f"Failed to generate embedding: {str(e)}")
    
    def generate_embeddings_batch(
        self, 
        texts: List[str], 
        use_cache: bool = True
    ) -> List[List[float]]:
        """Generate embeddings for multiple texts"""
        embeddings = []
        
        for text in texts:
            embedding = self.generate_embedding(text, use_cache)
            embeddings.append(embedding)
        
        return embeddings
    
    def generate_document_embedding(
        self,
        content: str,
        metadata: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Generate embedding with metadata enhancement"""
        # Enhance content with metadata if available
        enhanced_content = content
        
        if metadata:
            # Add title to content if available
            if "title" in metadata:
                enhanced_content = f"Title: {metadata['title']}\n\n{content}"
            
            # Add description if available
            if "description" in metadata:
                enhanced_content = f"{enhanced_content}\n\nDescription: {metadata['description']}"
            
            # Add tags if available
            if "tags" in metadata and metadata["tags"]:
                tags_str = ", ".join(metadata["tags"])
                enhanced_content = f"{enhanced_content}\n\nTags: {tags_str}"
        
        # Generate embedding
        embedding = self.generate_embedding(enhanced_content)
        
        return {
            "embedding": embedding,
            "original_content": content,
            "enhanced_content": enhanced_content,
            "token_count": self.count_tokens(enhanced_content)
        }
    
    def generate_query_embedding(self, query: str) -> List[float]:
        """Generate embedding for a search query"""
        # Don't add prefix - let the query match document content naturally
        return self.generate_embedding(query, use_cache=False)
    
    def generate_chunked_embeddings(
        self,
        text: str,
        chunk_size: int = 1000,
        overlap: int = 200,
        metadata: Optional[Dict[str, Any]] = None
    ) -> List[Dict[str, Any]]:
        """Generate embeddings for text chunks"""
        chunks = self.chunk_text(text, chunk_size, overlap)
        results = []
        
        for i, chunk in enumerate(chunks):
            chunk_metadata = metadata.copy() if metadata else {}
            chunk_metadata.update({
                "chunk_index": i,
                "total_chunks": len(chunks),
                "chunk_size": len(chunk)
            })
            
            embedding_result = self.generate_document_embedding(chunk, chunk_metadata)
            embedding_result["chunk_metadata"] = chunk_metadata
            results.append(embedding_result)
        
        return results
    
    def calculate_similarity(self, embedding1: List[float], embedding2: List[float]) -> float:
        """Calculate cosine similarity between two embeddings"""
        import numpy as np
        
        vec1 = np.array(embedding1)
        vec2 = np.array(embedding2)
        
        dot_product = np.dot(vec1, vec2)
        norm1 = np.linalg.norm(vec1)
        norm2 = np.linalg.norm(vec2)
        
        if norm1 == 0 or norm2 == 0:
            return 0.0
        
        similarity = dot_product / (norm1 * norm2)
        # Clamp to [-1, 1] to handle floating point precision issues
        return float(np.clip(similarity, -1.0, 1.0))
    
    def find_similar_texts(
        self,
        query_embedding: List[float],
        text_embeddings: List[Dict[str, Any]],
        threshold: float = 0.7,
        top_k: int = 5
    ) -> List[Dict[str, Any]]:
        """Find similar texts based on embeddings"""
        similarities = []
        
        for item in text_embeddings:
            similarity = self.calculate_similarity(
                query_embedding,
                item["embedding"]
            )
            
            if similarity >= threshold:
                similarities.append({
                    "text": item.get("text", ""),
                    "metadata": item.get("metadata", {}),
                    "similarity": similarity
                })
        
        # Sort by similarity and return top_k
        similarities.sort(key=lambda x: x["similarity"], reverse=True)
        return similarities[:top_k]

# Singleton instance
embedding_service = EmbeddingService()