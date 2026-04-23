import os
import json
import requests
import mysql.connector
from datetime import datetime
import time
from dotenv import load_dotenv
import docker_utils

# Load Environment Variables
load_dotenv()
RAPIDAPI_KEY = os.getenv("RAPIDAPI_KEY")
RAPIDAPI_HOST = os.getenv("RAPIDAPI_HOST", "instagram-looter2.p.rapidapi.com")
DB_HOST = os.getenv("DB_HOST", "127.0.0.1")
DB_USER = os.getenv("DB_USER", "root")
DB_PASSWORD = os.getenv("DB_PASSWORD", "")
DB_NAME = os.getenv("DB_NAME")
MYSQL_CONTAINER_NAME = os.getenv("MYSQL_CONTAINER_NAME", "mysql-container")

def get_db_connection():
    try:
        return mysql.connector.connect(
            host=DB_HOST, user=DB_USER, password=DB_PASSWORD, database=DB_NAME
        )
    except mysql.connector.Error as err:
        print(f"❌ Database connection failed in thread: {err}")
        return None

def setup_database(cursor):
    """Create the necessary database tables if they do not exist."""
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS accounts (
            internal_ig_id VARCHAR(255) PRIMARY KEY,
            username VARCHAR(255) NOT NULL,
            full_name VARCHAR(255),
            is_business BOOLEAN
        )
    """)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS daily_stats (
            id INT AUTO_INCREMENT PRIMARY KEY,
            account_id VARCHAR(255),
            date_checked DATE DEFAULT (CURRENT_DATE),
            scraped_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            followers INT,
            following INT,
            total_posts INT,
            FOREIGN KEY (account_id) REFERENCES accounts(internal_ig_id)
        )
    """)
    # Add scraped_at to existing tables that predate this column
    try:
        cursor.execute("ALTER TABLE daily_stats ADD COLUMN scraped_at DATETIME DEFAULT CURRENT_TIMESTAMP")
    except Exception:
        pass  # Column already exists
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS posts (
            shortcode VARCHAR(255) PRIMARY KEY,
            account_id VARCHAR(255),
            caption TEXT,
            likes INT,
            comments INT,
            is_video BOOLEAN,
            views INT,
            posted_timestamp DATETIME,
            scraped_timestamp DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            FOREIGN KEY (account_id) REFERENCES accounts(internal_ig_id)
        )
    """)

def process_account_data(db_conn, cursor, data: dict, force_date=None):
    """Processes parsed JSON data from IG into the MySQL database mapping."""
    internal_ig_id = data.get("id")
    username = data.get("username")
    full_name = data.get("full_name")
    is_business = data.get("is_business_account")
    
    # Insert Account
    account_sql = "INSERT IGNORE INTO accounts (internal_ig_id, username, full_name, is_business) VALUES (%s, %s, %s, %s)"
    cursor.execute(account_sql, (internal_ig_id, username, full_name, is_business))
    
    # Extract stats
    followers = data.get("edge_followed_by", {}).get("count")
    following = data.get("edge_follow", {}).get("count")
    total_posts = data.get("edge_owner_to_timeline_media", {}).get("count")
    
    # Insert Daily Stats, supporting catchups
    now = datetime.now()
    if force_date:
        stats_sql = "INSERT INTO daily_stats (account_id, followers, following, total_posts, date_checked, scraped_at) VALUES (%s, %s, %s, %s, %s, %s)"
        cursor.execute(stats_sql, (internal_ig_id, followers, following, total_posts, force_date, now))
    else:
        stats_sql = "INSERT INTO daily_stats (account_id, followers, following, total_posts, scraped_at) VALUES (%s, %s, %s, %s, %s)"
        cursor.execute(stats_sql, (internal_ig_id, followers, following, total_posts, now))
        
    db_conn.commit()
    print(f"✅ Processed Stats for '{username}'.")

def bulk_insert_posts(db_conn, cursor, internal_ig_id, edges):
    """Inserts a batch of post edges"""
    inserted = 0
    updated = 0
    post_sql = """
        INSERT INTO posts (shortcode, account_id, caption, likes, comments, is_video, views, posted_timestamp)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        ON DUPLICATE KEY UPDATE 
            likes = VALUES(likes), comments = VALUES(comments), views = VALUES(views)
    """
    for edge in edges:
        node = edge.get("node", {})
        shortcode = node.get("shortcode")
        caption_edges = node.get("edge_media_to_caption", {}).get("edges", [])
        caption = caption_edges[0].get("node", {}).get("text", "") if caption_edges else ""
        likes = node.get("edge_liked_by", {}).get("count", 0)
        comments = node.get("edge_media_to_comment", {}).get("count", 0)
        is_video = node.get("is_video", False)
        views = node.get("video_view_count", 0) if is_video else 0
        ts = node.get("taken_at_timestamp")
        dt_string = datetime.fromtimestamp(ts).strftime('%Y-%m-%d %H:%M:%S') if ts else None
        
        cursor.execute(post_sql, (shortcode, internal_ig_id, caption, likes, comments, is_video, views, dt_string))
        if cursor.rowcount == 1:
            inserted += 1
        elif cursor.rowcount == 2:
            updated += 1
    db_conn.commit()
    return inserted, updated

def _load_config():
    with open("scraper_config.json", "r") as f:
        return json.load(f)

def run_daily_scrape(force_date=None):
    """Automated background task to scrape targets normally (no heavy pagination)."""
    if not docker_utils.validate_docker_env(MYSQL_CONTAINER_NAME):
        return
        
    config = _load_config()
    usernames = config.get("target_accounts", [])
    
    conn = get_db_connection()
    if not conn: return
    cursor = conn.cursor()
    setup_database(cursor)
    
    url = f"https://{RAPIDAPI_HOST}/profile"
    headers = {"X-RapidAPI-Key": RAPIDAPI_KEY, "X-RapidAPI-Host": RAPIDAPI_HOST}
    
    print(f"\n[Thread] Beginning incremental scrape for {len(usernames)} users...")
    for user in usernames:
        response = requests.get(url, headers=headers, params={"username": user})
        if response.status_code == 200:
            data = response.json()
            user_data = data.get("data", {}).get("user") or data
            if user_data and user_data.get("id"):
                process_account_data(conn, cursor, user_data, force_date)
                # Native profile endpoints yield 12 posts inside timeline.
                edges = user_data.get("edge_owner_to_timeline_media", {}).get("edges", [])
                i, u = bulk_insert_posts(conn, cursor, user_data.get("id"), edges)
                print(f"   -> Inserted {i}, Updated {u} posts.")
    cursor.close()
    conn.close()

def fetch_account_count(username):
    """Fetches total posts purely for UI projection."""
    url = f"https://{RAPIDAPI_HOST}/profile"
    headers = {"X-RapidAPI-Key": RAPIDAPI_KEY, "X-RapidAPI-Host": RAPIDAPI_HOST}
    response = requests.get(url, headers=headers, params={"username": username})
    if response.status_code == 200:
        data = response.json()
        user_data = data.get("data", {}).get("user") or data
        return user_data.get("edge_owner_to_timeline_media", {}).get("count", 0)
    return 0

def run_deep_scrape(username, limit, delay):
    """Background task to paginate heavily and deep scrape backwards."""
    print(f"[Deep Scrape] Initializing for @{username} (Target Limit: {limit})")
    conn = get_db_connection()
    if not conn: return
    cursor = conn.cursor()
    setup_database(cursor)
    
    url = f"https://{RAPIDAPI_HOST}/profile"
    headers = {"X-RapidAPI-Key": RAPIDAPI_KEY, "X-RapidAPI-Host": RAPIDAPI_HOST}
    
    current_cursor = None
    posts_scraped = 0
    scraped_internal_id = None
    
    while posts_scraped < limit:
        # Build query
        querystring = {"username": username}
        if current_cursor:
            querystring["max_id"] = current_cursor
            
        response = requests.get(url, headers=headers, params=querystring)
        if response.status_code != 200:
            print(f"❌ [Deep Scrape] API Error {response.status_code} at cursor {current_cursor}")
            break
            
        data = response.json()
        user_data = data.get("data", {}).get("user") or data
        scraped_internal_id = user_data.get("id")
        
        timeline = user_data.get("edge_owner_to_timeline_media", {})
        edges = timeline.get("edges", [])
        
        # We might grab more edges than we need on the final page; slice it if so.
        remaining = limit - posts_scraped
        if len(edges) > remaining:
            edges = edges[:remaining]
            
        i, u = bulk_insert_posts(conn, cursor, scraped_internal_id, edges)
        posts_scraped += len(edges)
        print(f"   -> [Deep] Scraped page. DB Inserted {i}, Updated {u}. Total Extracted: {posts_scraped}/{limit}")
        
        # Check cursor
        page_info = timeline.get("page_info", {})
        has_next_page = page_info.get("has_next_page", False)
        
        if not has_next_page or posts_scraped >= limit:
            break
            
        current_cursor = page_info.get("end_cursor")
        if not current_cursor:
            break
            
        print(f"   -> [Deep] Sleeping {delay} seconds before next cursor loop...")
        time.sleep(delay)
        
    cursor.close()
    conn.close()
    print(f"🎉 [Deep Scrape] Completed @{username}. Total extracted elements: {posts_scraped}")

def rescrape_single_post(shortcode):
    """Hits rapidapi specifically for a singular post to live-sync it gracefully."""
    conn = get_db_connection()
    if not conn: return False
    cursor = conn.cursor()
    
    url = f"https://{RAPIDAPI_HOST}/post"
    headers = {"X-RapidAPI-Key": RAPIDAPI_KEY, "X-RapidAPI-Host": RAPIDAPI_HOST}
    post_url = f"https://www.instagram.com/p/{shortcode}/"
    
    print(f"[Rescrape] Refreshing {post_url} ...")
    response = requests.get(url, headers=headers, params={"url": post_url})
    
    if response.status_code == 200:
        data = response.json()
        if data.get("status") == True:
            # Reconstruct mapping safely
            likes = data.get("edge_media_preview_like", {}).get("count", 0)
            
            # Use 'edge_media_preview_comment' as standard for basic post preview counts
            # or 'edge_media_to_parent_comment' / 'edge_media_to_comment' 
            comments_node = data.get("edge_media_to_parent_comment") or data.get("edge_media_preview_comment") or {}
            comments = comments_node.get("count", 0)
            
            views = data.get("video_view_count", 0)
            
            update_sql = """
                UPDATE posts 
                SET likes = %s, comments = %s, views = %s
                WHERE shortcode = %s
            """
            cursor.execute(update_sql, (likes, comments, views, shortcode))
            conn.commit()
            
            cursor.close()
            conn.close()
            return True
            
    cursor.close()
    conn.close()
    return False

if __name__ == "__main__":
    # Natively acts as scraper if run standalone
    run_daily_scrape()