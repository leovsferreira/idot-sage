
from flask import Flask, jsonify, request, Response
from flask_cors import CORS
import os
from dotenv import load_dotenv
from datetime import datetime, timezone
import sage_data_client
import pandas as pd
import requests

load_dotenv()

app = Flask(__name__)
CORS(app)

SAGE_USERNAME = os.getenv('SAGE_USERNAME')
SAGE_ACCESS_TOKEN = os.getenv('SAGE_ACCESS_TOKEN')

@app.route('/api/health', methods=['GET'])
def health_check():
    return jsonify({"status": "healthy", "message": "Backend is running"})

@app.route('/api/query', methods=['POST'])
def handle_query():
    try:
        data = request.get_json()
        
        start_date = data.get('startDate')
        end_date = data.get('endDate')
        start_time = data.get('startTime')
        end_time = data.get('endTime') 
        node = data.get('node')
        
        if start_time:
            start = f"{start_date}T{start_time}:00Z"
        else:
            start = f"{start_date}T00:00:00Z"
            
        if end_time:
            end = f"{end_date}T{end_time}:59Z"
        else:
            end = f"{end_date}T23:59:59Z"
        
        filter_params = {
            "plugin": ".*multithread-sage-idot:1.0.0",
            "vsn": node
        }
        
        df = sage_data_client.query(
            start=start,
            end=end,
            filter=filter_params
        )
        
        if not df.empty:
            upload_df = df[df['name'] == 'upload'].copy()
            
            images = []
            for idx, row in upload_df.iterrows():
                images.append({
                    'url': row['value'],
                    'timestamp': row['timestamp'].isoformat() if hasattr(row['timestamp'], 'isoformat') else str(row['timestamp']),
                    'node': row['meta.vsn'],
                    'filename': row.get('meta.filename', 'snapshot.jpg')
                })
            
            return jsonify({
                "success": True,
                "images": images,
                "total": len(images),
                "query": {
                    "start": start,
                    "end": end,
                    "node": node
                }
            })
        else:
            return jsonify({
                "success": True,
                "images": [],
                "total": 0,
                "query": {
                    "start": start,
                    "end": end,
                    "node": node
                }
            })
            
    except Exception as e:
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500

@app.route('/api/llm-query', methods=['POST'])
def handle_llm_query():
    data = request.get_json()
    return jsonify({"message": "LLM query received", "data": data})

@app.route('/api/proxy-image', methods=['GET'])
def proxy_image():
    """Proxy images from the sage storage to avoid CORS issues"""
    image_url = request.args.get('url')
    
    if not image_url:
        return jsonify({"error": "No URL provided"}), 400
    
    try:
        response = requests.get(
            image_url, 
            auth=(SAGE_USERNAME, SAGE_ACCESS_TOKEN),
            stream=True
        )
        response.raise_for_status()
        
        content_type = response.headers.get('Content-Type', 'image/jpeg')
        
        return Response(
            response.iter_content(chunk_size=1024),
            content_type=content_type,
            headers={
                'Cache-Control': 'public, max-age=3600'
            }
        )
    except requests.exceptions.HTTPError as e:
        if e.response.status_code == 401:
            return jsonify({"error": "Authentication failed. Please check your Sage credentials."}), 401
        return jsonify({"error": f"HTTP Error: {e}"}), e.response.status_code
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True, port=5000)