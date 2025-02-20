
from replit.object_storage import Client
from langchain_community.embeddings import HuggingFaceEmbeddings
from langchain.text_splitter import RecursiveCharacterTextSplitter
import faiss
import numpy as np
import pickle
import json
import os
from datetime import datetime

class StorageHandler:
    def __init__(self):
        self.client = Client()
        self.embeddings = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")
        self.text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=1000,
            chunk_overlap=200,
            length_function=len,
        )
        self.index = None
        self.load_or_create_index()
        
    def load_or_create_index(self):
        try:
            index_data = self.client.download_from_bytes("faiss_index.pkl")
            self.index = pickle.loads(index_data)
            metadata = json.loads(self.client.download_from_text("docs_metadata.json"))
            self.docs_metadata = metadata
        except:
            dimension = 384  # all-MiniLM-L6-v2 dimension
            self.index = faiss.IndexFlatL2(dimension)
            self.docs_metadata = []
            self.save_index()
    
    def save_index(self):
        index_bytes = pickle.dumps(self.index)
        self.client.upload_from_bytes("faiss_index.pkl", index_bytes)
        self.client.upload_from_text("docs_metadata.json", json.dumps(self.docs_metadata))
    
    def process_document(self, content, filename):
        chunks = self.text_splitter.split_text(content)
        embeddings = self.embeddings.embed_documents(chunks)
        
        doc_id = len(self.docs_metadata)
        metadata = {
            "id": doc_id,
            "filename": filename,
            "chunks": chunks,
            "timestamp": datetime.now().isoformat()
        }
        self.docs_metadata.append(metadata)
        
        embeddings_np = np.array(embeddings).astype('float32')
        self.index.add(embeddings_np)
        self.save_index()
        
        return {"message": "Document processed successfully", "id": doc_id}
    
    def search(self, query, k=3):
        query_embedding = self.embeddings.embed_query(query)
        query_embedding_np = np.array([query_embedding]).astype('float32')
        
        D, I = self.index.search(query_embedding_np, k)
        
        results = []
        for distances, indices in zip(D[0], I[0]):
            if distances < float('inf'):
                doc_idx = indices // len(self.text_splitter.split_text("dummy"))
                chunk_idx = indices % len(self.text_splitter.split_text("dummy"))
                
                if doc_idx < len(self.docs_metadata):
                    doc = self.docs_metadata[doc_idx]
                    if chunk_idx < len(doc["chunks"]):
                        results.append({
                            "content": doc["chunks"][chunk_idx],
                            "filename": doc["filename"],
                            "distance": float(distances)
                        })
        
        return results

    def list_documents(self):
        return [{"id": doc["id"], "filename": doc["filename"], 
                "timestamp": doc["timestamp"]} 
                for doc in self.docs_metadata]

    def delete_document(self, doc_id):
        if 0 <= doc_id < len(self.docs_metadata):
            # Note: In FAISS, we can't easily delete vectors
            # In production, consider using FAISS with IDMap
            self.docs_metadata.pop(doc_id)
            self.save_index()
            return {"message": "Document deleted successfully"}
        return {"error": "Document not found"}, 404
