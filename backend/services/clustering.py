import numpy as np
from sklearn.decomposition import PCA
from sklearn.preprocessing import StandardScaler
from sklearn.cluster import KMeans
from typing import List, Dict, Any, Optional, Tuple
import math

try:
    from sklearn.cluster import HDBSCAN
    HAS_HDBSCAN = True
except ImportError:
    HAS_HDBSCAN = False
    from sklearn.cluster import DBSCAN

class SpatialOrganizer:
    def __init__(self, n_components: int = 3):
        self.n_components = n_components
        self.pca = None
        self.scaler = StandardScaler()
        self.cluster_model = None
        self.fitted = False
    
    def calculate_3d_positions(
        self,
        embeddings: List[List[float]],
        method: str = "pca"
    ) -> List[Dict[str, float]]:
        """Convert high-dimensional embeddings to 3D positions"""
        if not embeddings:
            return []
        
        embeddings_array = np.array(embeddings)
        
        if method == "pca":
            positions = self._pca_positions(embeddings_array)
        elif method == "tsne":
            positions = self._tsne_positions(embeddings_array)
        elif method == "umap":
            positions = self._umap_positions(embeddings_array)
        else:
            positions = self._pca_positions(embeddings_array)
        
        # Normalize positions to reasonable range (-10, 10)
        positions = self._normalize_positions(positions)
        
        # Convert to list of dicts
        result = []
        for pos in positions:
            result.append({
                "x": float(pos[0]),
                "y": float(pos[1]),
                "z": float(pos[2])
            })
        
        return result
    
    def _pca_positions(self, embeddings: np.ndarray) -> np.ndarray:
        """Use PCA for dimensionality reduction"""
        # Handle case where we have fewer samples than components
        n_samples = embeddings.shape[0]
        n_components = min(self.n_components, n_samples, embeddings.shape[1])
        
        if n_samples == 1:
            # Single document - place at origin
            return np.zeros((1, 3))
        
        # Standardize the features
        embeddings_scaled = self.scaler.fit_transform(embeddings)
        
        # Apply PCA
        self.pca = PCA(n_components=n_components)
        positions = self.pca.fit_transform(embeddings_scaled)
        
        # If we got fewer than 3 components, pad with zeros
        if positions.shape[1] < 3:
            padding = np.zeros((positions.shape[0], 3 - positions.shape[1]))
            positions = np.hstack([positions, padding])
        
        self.fitted = True
        return positions
    
    def _tsne_positions(self, embeddings: np.ndarray) -> np.ndarray:
        """Use t-SNE for dimensionality reduction"""
        try:
            from sklearn.manifold import TSNE
            
            n_samples = embeddings.shape[0]
            if n_samples == 1:
                return np.zeros((1, 3))
            
            # t-SNE requires at least perplexity samples
            perplexity = min(30, n_samples - 1)
            
            tsne = TSNE(n_components=3, perplexity=perplexity, random_state=42)
            positions = tsne.fit_transform(embeddings)
            return positions
        except ImportError:
            # Fallback to PCA if t-SNE not available
            return self._pca_positions(embeddings)
    
    def _umap_positions(self, embeddings: np.ndarray) -> np.ndarray:
        """Use UMAP for dimensionality reduction"""
        try:
            import umap
            
            n_samples = embeddings.shape[0]
            if n_samples == 1:
                return np.zeros((1, 3))
            
            n_neighbors = min(15, n_samples - 1)
            
            reducer = umap.UMAP(
                n_components=3,
                n_neighbors=n_neighbors,
                random_state=42
            )
            positions = reducer.fit_transform(embeddings)
            return positions
        except ImportError:
            # Fallback to PCA if UMAP not available
            return self._pca_positions(embeddings)
    
    def _normalize_positions(self, positions: np.ndarray) -> np.ndarray:
        """Normalize positions to a reasonable 3D space range"""
        if positions.size == 0:
            return positions
        
        # Center the positions
        positions = positions - np.mean(positions, axis=0)
        
        # Scale to fit within a sphere of radius 10
        max_dist = np.max(np.linalg.norm(positions, axis=1))
        if max_dist > 0:
            positions = positions * (10 / max_dist)
        
        return positions
    
    def cluster_documents(
        self,
        embeddings: List[List[float]],
        method: str = "hdbscan",
        n_clusters: Optional[int] = None
    ) -> List[int]:
        """Cluster documents based on their embeddings"""
        if not embeddings:
            return []
        
        embeddings_array = np.array(embeddings)
        n_samples = embeddings_array.shape[0]
        
        if n_samples < 2:
            return [0] * n_samples
        
        if method == "kmeans" and n_clusters:
            # Use K-means with specified number of clusters
            n_clusters = min(n_clusters, n_samples)
            self.cluster_model = KMeans(n_clusters=n_clusters, random_state=42)
            labels = self.cluster_model.fit_predict(embeddings_array)
        
        elif method == "hdbscan" and HAS_HDBSCAN:
            # Use HDBSCAN for automatic cluster detection
            min_cluster_size = max(2, n_samples // 10)
            self.cluster_model = HDBSCAN(min_cluster_size=min_cluster_size)
            labels = self.cluster_model.fit_predict(embeddings_array)
        
        else:
            # Fallback to DBSCAN
            self.cluster_model = DBSCAN(eps=0.5, min_samples=2)
            labels = self.cluster_model.fit_predict(embeddings_array)
        
        return labels.tolist()
    
    def organize_spatial_layout(
        self,
        documents: List[Dict[str, Any]],
        embeddings: List[List[float]]
    ) -> Dict[str, Any]:
        """Organize documents in 3D space with clustering"""
        if not documents or not embeddings:
            return {
                "documents": [],
                "clusters": [],
                "connections": []
            }
        
        # Calculate 3D positions
        positions = self.calculate_3d_positions(embeddings)
        
        # Perform clustering
        cluster_labels = self.cluster_documents(embeddings)
        
        # Calculate connections (similar documents)
        connections = self._calculate_connections(embeddings)
        
        # Combine results
        organized_docs = []
        for i, doc in enumerate(documents):
            organized_docs.append({
                **doc,
                "position": positions[i] if i < len(positions) else {"x": 0, "y": 0, "z": 0},
                "cluster": cluster_labels[i] if i < len(cluster_labels) else -1
            })
        
        # Calculate cluster centers and info
        clusters = self._calculate_cluster_info(positions, cluster_labels)
        
        return {
            "documents": organized_docs,
            "clusters": clusters,
            "connections": connections
        }
    
    def _calculate_connections(
        self,
        embeddings: List[List[float]],
        threshold: float = 0.8
    ) -> List[Dict[str, Any]]:
        """Calculate strong connections between documents"""
        connections = []
        n_docs = len(embeddings)
        
        if n_docs < 2:
            return connections
        
        embeddings_array = np.array(embeddings)
        
        # Calculate pairwise cosine similarities
        for i in range(n_docs):
            for j in range(i + 1, n_docs):
                similarity = self._cosine_similarity(
                    embeddings_array[i],
                    embeddings_array[j]
                )
                
                if similarity >= threshold:
                    connections.append({
                        "source": i,
                        "target": j,
                        "strength": float(similarity)
                    })
        
        return connections
    
    def _cosine_similarity(self, vec1: np.ndarray, vec2: np.ndarray) -> float:
        """Calculate cosine similarity between two vectors"""
        dot_product = np.dot(vec1, vec2)
        norm1 = np.linalg.norm(vec1)
        norm2 = np.linalg.norm(vec2)
        
        if norm1 == 0 or norm2 == 0:
            return 0.0
        
        similarity = dot_product / (norm1 * norm2)
        # Clamp to [-1, 1] to handle floating point precision issues
        return float(np.clip(similarity, -1.0, 1.0))
    
    def _calculate_cluster_info(
        self,
        positions: List[Dict[str, float]],
        labels: List[int]
    ) -> List[Dict[str, Any]]:
        """Calculate cluster centers and information"""
        if not positions or not labels:
            return []
        
        clusters = {}
        positions_array = np.array([[p["x"], p["y"], p["z"]] for p in positions])
        
        for i, label in enumerate(labels):
            if label == -1:  # Noise point in DBSCAN/HDBSCAN
                continue
            
            if label not in clusters:
                clusters[label] = {
                    "id": label,
                    "documents": [],
                    "positions": []
                }
            
            clusters[label]["documents"].append(i)
            clusters[label]["positions"].append(positions_array[i])
        
        # Calculate cluster centers
        cluster_list = []
        for cluster_id, cluster_data in clusters.items():
            positions = np.array(cluster_data["positions"])
            center = np.mean(positions, axis=0)
            
            cluster_list.append({
                "cluster_id": cluster_id,
                "center": {
                    "x": float(center[0]),
                    "y": float(center[1]),
                    "z": float(center[2])
                },
                "size": len(cluster_data["documents"]),
                "document_indices": cluster_data["documents"]
            })
        
        return cluster_list
    
    def calculate_document_spread(self, positions: List[Dict[str, float]]) -> float:
        """Calculate how spread out documents are in 3D space"""
        if len(positions) < 2:
            return 0.0
        
        positions_array = np.array([[p["x"], p["y"], p["z"]] for p in positions])
        
        # Calculate average distance from centroid
        centroid = np.mean(positions_array, axis=0)
        distances = np.linalg.norm(positions_array - centroid, axis=1)
        
        return float(np.mean(distances))
    
    def suggest_optimal_clusters(self, embeddings: List[List[float]]) -> int:
        """Suggest optimal number of clusters using elbow method"""
        if len(embeddings) < 3:
            return 1
        
        embeddings_array = np.array(embeddings)
        max_clusters = min(10, len(embeddings) - 1)
        
        inertias = []
        for k in range(1, max_clusters + 1):
            kmeans = KMeans(n_clusters=k, random_state=42)
            kmeans.fit(embeddings_array)
            inertias.append(kmeans.inertia_)
        
        # Find elbow point
        if len(inertias) < 3:
            return 2
        
        # Calculate second derivative
        second_derivative = []
        for i in range(1, len(inertias) - 1):
            sd = inertias[i+1] - 2*inertias[i] + inertias[i-1]
            second_derivative.append(sd)
        
        # Find maximum second derivative (elbow point)
        elbow_idx = np.argmax(second_derivative) + 2  # +2 because we start from k=1 and skip first point
        
        return elbow_idx

# Singleton instance
spatial_organizer = SpatialOrganizer()