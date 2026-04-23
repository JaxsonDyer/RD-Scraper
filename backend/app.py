import os
import json
import threading
from openai import OpenAI
from datetime import datetime, date
from flask import Flask, g, request, jsonify
from flask_cors import CORS
import mysql.connector
from dotenv import load_dotenv
from apscheduler.schedulers.background import BackgroundScheduler
from tzlocal import get_localzone
import main as scraper_backend

load_dotenv()

app = Flask(__name__)
CORS(app)

# DB Config
DB_HOST = os.getenv("DB_HOST", "127.0.0.1")
DB_USER = os.getenv("DB_USER", "root")
DB_PASSWORD = os.getenv("DB_PASSWORD", "root")
DB_NAME = os.getenv("DB_NAME", "scraper_db")

OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")
llm_client = OpenAI(
  base_url="https://openrouter.ai/api/v1",
  api_key=OPENROUTER_API_KEY,
) if OPENROUTER_API_KEY else None

# Scheduler Globals
scheduler = BackgroundScheduler(timezone=str(get_localzone()))

def get_db():
    if 'db' not in g:
        g.db = mysql.connector.connect(
            host=DB_HOST, user=DB_USER, password=DB_PASSWORD, database=DB_NAME
        )
    return g.db

@app.teardown_appcontext
def close_db(error):
    db = g.pop('db', None)
    if db is not None:
        db.close()

# --- RESILIENCE CATCHUP & SCHEDULER SYNC LOGIC ---

def generate_insights_logic():
    if not llm_client:
        return {"error": "OpenRouter API key not configured"}
    try:
        with open("scraper_config.json", "r") as f:
            config = json.load(f)
        llm_config = config.get("llm_config", {"lookback_days": 7, "max_posts": 10, "model": "google/gemini-2.5-flash"})
        
        db = mysql.connector.connect(host=DB_HOST, user=DB_USER, password=DB_PASSWORD, database=DB_NAME)
        cursor = db.cursor(dictionary=True)
        
        query = """
            SELECT a.username, p.caption, p.likes, p.comments, p.views, p.posted_timestamp
            FROM posts p
            JOIN accounts a ON p.account_id = a.internal_ig_id
            WHERE p.posted_timestamp >= DATE_SUB(NOW(), INTERVAL %s DAY)
            ORDER BY (p.likes + p.comments) DESC
            LIMIT %s
        """
        cursor.execute(query, (llm_config["lookback_days"], llm_config["max_posts"]))
        top_posts = cursor.fetchall()
        
        for p in top_posts:
            if p["posted_timestamp"]:
                p["posted_timestamp"] = p["posted_timestamp"].isoformat()
                
        context_data = json.dumps(top_posts, indent=2)
        
        prompt = f"""You are a Local Area Intelligence Analyst for Red Deer.
Analyze the following top-performing Instagram posts from the last {llm_config["lookback_days"]} days.

Data:
{context_data}

Return a STRICT JSON response matching this exact schema:
{{
  "communityPulse": "A short paragraph (2-3 sentences) on trending local themes based on the data.",
  "viralAnomaly": "A short paragraph highlighting one standout/anomalous post (e.g. wildly high comments or likes) and explaining why it worked.",
  "sectorMomentum": [
    "bullet point 1 highlighting a successful niche (e.g. food, news, events) based on these posts",
    "bullet point 2...",
    "bullet point 3..."
  ]
}}
"""

        response = llm_client.chat.completions.create(
            model=llm_config["model"],
            messages=[
                {"role": "system", "content": "You are a professional social media analyst AI."},
                {"role": "user", "content": prompt}
            ],
            response_format={"type": "json_object"}
        )
        
        result_json_str = response.choices[0].message.content
        result_json = json.loads(result_json_str)
        
        cursor.execute("REPLACE INTO ai_cache (id, data) VALUES (1, %s)", (json.dumps(result_json),))
        db.commit()
            
        cursor.close()
        db.close()
        return result_json
        
    except Exception as e:
        print("AI INSIGHTS GENERATION ERROR:", e)
        return {"error": str(e)}

def background_scrape_and_insights(force_date=None):
    scraper_backend.run_daily_scrape(force_date)
    print("⚙️ Scrape finished. Generating AI Insights...")
    generate_insights_logic()

def setup_scheduler():
    """Reads config, clears previous jobs, and sets the daily cron."""
    with open("scraper_config.json", "r") as f:
        config = json.load(f)
        
    run_time = config.get("daily_run_time", "00:00")
    h, m = run_time.split(":")
    
    # Reset existing jobs if reloading
    scheduler.remove_all_jobs()
    scheduler.add_job(
        func=background_scrape_and_insights,
        trigger="cron",
        hour=int(h),
        minute=int(m),
        id="daily_scrape_job",
        replace_existing=True
    )
    if not scheduler.running:
        scheduler.start()

def execute_resilience_check():
    """Checks if a scrape occurred today for targeted accounts. If not, catch up."""
    try:
        # We need a direct connection since we are outside request context
        conn = mysql.connector.connect(host=DB_HOST, user=DB_USER, password=DB_PASSWORD, database=DB_NAME)
        cursor = conn.cursor(dictionary=True)
        
        with open("scraper_config.json", "r") as f:
            config = json.load(f)
            
        targets = config.get("target_accounts", [])
        if not targets: return
        
        # Check daily stats for today
        today = date.today()
        # Find how many of our targets got backed up today
        # To simplify, we just check if the amount of targets present today equals our config list size
        query = "SELECT COUNT(DISTINCT account_id) as count FROM daily_stats WHERE date_checked = %s"
        cursor.execute(query, (today,))
        res = cursor.fetchone()
        
        if res and res['count'] < len(targets):
            print(f"⚠️ [Resilience] Found missing scrape logs for today ({today}). Launching catch-up thread...")
            threading.Thread(target=background_scrape_and_insights, args=[today]).start()
            
        cursor.close()
        conn.close()
    except Exception as e:
        print(f"❌ [Resilience] Could not execute DB check. Missing DB? ({e})")

# Hook on initial startup before the first request
@app.before_request
def initialize():
    # Utilizing app.config to guarantee it only runs strictly one time across Flask threads
    if not app.config.get('SCHEDULER_INIT'):
        print("⚙️ Initializing Scraper Background Manager...")
        setup_scheduler()
        execute_resilience_check()
        # Run any pending DB migrations
        try:
            conn = mysql.connector.connect(
                host=DB_HOST, user=DB_USER, password=DB_PASSWORD, database=DB_NAME
            )
            cur = conn.cursor()
            cur.execute("ALTER TABLE daily_stats ADD COLUMN scraped_at DATETIME DEFAULT CURRENT_TIMESTAMP")
            conn.commit()
            cur.close()
            print("✅ Migration: added scraped_at column to daily_stats")
        except Exception:
            pass  # Column already exists or table not yet created
            
        try:
            cur = conn.cursor()
            cur.execute("""
                CREATE TABLE IF NOT EXISTS ai_cache (
                    id INT PRIMARY KEY DEFAULT 1,
                    data JSON,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
                )
            """)
            conn.commit()
            cur.close()
        except Exception as e:
            print("Cache migration error:", e)
        finally:
            try: conn.close()
            except: pass
            
        app.config['SCHEDULER_INIT'] = True

# --- EXISTING ROUTES ---

@app.route('/api/accounts')
def index():
    db = get_db()
    cursor = db.cursor(dictionary=True)
    query = """
        SELECT username, full_name, is_business,
               date_checked, followers, following, total_posts
        FROM (
            SELECT a.username, a.full_name, a.is_business,
                   s.date_checked, s.followers, s.following, s.total_posts,
                   ROW_NUMBER() OVER (
                       PARTITION BY a.internal_ig_id
                       ORDER BY s.date_checked DESC, s.followers DESC
                   ) AS rn
            FROM accounts a
            LEFT JOIN daily_stats s ON a.internal_ig_id = s.account_id
        ) ranked
        WHERE rn = 1
        ORDER BY followers DESC
    """
    cursor.execute(query)
    accounts = cursor.fetchall()
    return jsonify(accounts=accounts)

@app.route('/api/account-history/<username>')
def account_history(username):
    """Returns full time-series data for a single account."""
    db = get_db()
    cursor = db.cursor(dictionary=True)

    # Profile stats over time (followers, following, total_posts)
    cursor.execute("""
        SELECT s.date_checked, s.followers, s.following, s.total_posts
        FROM daily_stats s
        JOIN accounts a ON s.account_id = a.internal_ig_id
        WHERE a.username = %s
        ORDER BY s.date_checked ASC
    """, (username,))
    profile_history = cursor.fetchall()

    # Engagement totals per scraped day
    cursor.execute("""
        SELECT DATE(p.scraped_timestamp) as scrape_date,
               COALESCE(SUM(p.likes), 0) as likes,
               COALESCE(SUM(p.comments), 0) as comments,
               COALESCE(SUM(p.views), 0) as views,
               COUNT(*) as posts_scraped
        FROM posts p
        JOIN accounts a ON p.account_id = a.internal_ig_id
        WHERE a.username = %s AND p.scraped_timestamp IS NOT NULL
        GROUP BY DATE(p.scraped_timestamp)
        ORDER BY scrape_date ASC
    """, (username,))
    engagement_history = cursor.fetchall()

    return jsonify(
        profile_history=profile_history,
        engagement_history=engagement_history
    )

@app.route('/api/stats')
def stats():
    """Returns aggregate engagement totals across all scraped posts."""
    db = get_db()
    cursor = db.cursor(dictionary=True)

    cursor.execute("""
        SELECT
            COUNT(*) as total_posts,
            COALESCE(SUM(likes), 0) as total_likes,
            COALESCE(SUM(comments), 0) as total_comments,
            COALESCE(SUM(views), 0) as total_views
        FROM posts
    """)
    totals = cursor.fetchone()

    # Per-account breakdown for sector momentum
    cursor.execute("""
        SELECT a.username,
               COUNT(p.shortcode) as post_count,
               COALESCE(SUM(p.likes), 0) as likes,
               COALESCE(SUM(p.comments), 0) as comments,
               COALESCE(SUM(p.views), 0) as views
        FROM accounts a
        LEFT JOIN posts p ON p.account_id = a.internal_ig_id
        GROUP BY a.username
        ORDER BY likes DESC
    """)
    by_account = cursor.fetchall()

    return jsonify(totals=totals, by_account=by_account)

@app.route('/api/posts')
def posts():
    db = get_db()
    cursor = db.cursor(dictionary=True)
    cursor.execute("SELECT username, internal_ig_id FROM accounts ORDER BY username ASC")
    users = cursor.fetchall()
    
    selected_username = request.args.get('username')
    
    if selected_username:
        query = """
            SELECT p.shortcode, p.caption, p.likes, p.comments, p.views, p.is_video, p.posted_timestamp, p.scraped_timestamp, a.username 
            FROM posts p
            JOIN accounts a ON p.account_id = a.internal_ig_id
            WHERE a.username = %s
            ORDER BY p.posted_timestamp DESC
        """
        cursor.execute(query, (selected_username,))
    else:
        query = """
            SELECT p.shortcode, p.caption, p.likes, p.comments, p.views, p.is_video, p.posted_timestamp, p.scraped_timestamp, a.username 
            FROM posts p
            JOIN accounts a ON p.account_id = a.internal_ig_id
            ORDER BY p.posted_timestamp DESC
        """
        cursor.execute(query)
        
    posts_data = cursor.fetchall()
    return jsonify(posts=posts_data, users=users, selected_username=selected_username)

# --- NEW MANAGER ROUTES ---

@app.route('/api/config', methods=['GET'])
def get_config():
    """Returns the current config for the Scraper Manager UI"""
    with open("scraper_config.json", "r") as f:
        config = json.load(f)
    return jsonify(config)

@app.route('/api/config', methods=['POST'])
def save_config():
    """Updates config.json and re-syncs APScheduler."""
    data = request.json
    
    if not data or "target_accounts" not in data or "daily_run_time" not in data:
        return jsonify({"success": False, "error": "Invalid payload."}), 400
        
    # Standardize arrays
    targets = [t.strip() for t in data["target_accounts"].split(',') if t.strip()]
    
    new_config = {
        "target_accounts": targets,
        "daily_run_time": data["daily_run_time"],
        "incremental_post_limit": int(data.get("incremental_post_limit", 12)),
        "llm_config": data.get("llm_config", {
            "lookback_days": 7,
            "max_posts": 10,
            "model": "google/gemini-2.5-flash"
        })
    }
    
    with open("scraper_config.json", "w") as f:
        json.dump(new_config, f, indent=2)
        
    # Re-sync scheduler core
    setup_scheduler()
    return jsonify({"success": True, "message": "Configuration saved & Scheduler updated."})

@app.route('/api/force-scrape', methods=['POST'])
def force_scrape():
    """Background-threads a standard daily scrape loop over current targets."""
    threading.Thread(target=background_scrape_and_insights).start()
    return jsonify({"success": True, "message": "Scrape initialized in the background, insights will generate after."})

@app.route('/api/analyze-account', methods=['POST'])
def analyze_account():
    """Hits API directly to find post count for Deep Scrape config."""
    username = request.json.get('username')
    if not username: return jsonify({"success": False}), 400
    
    count = scraper_backend.fetch_account_count(username)
    return jsonify({"success": True, "count": count})

@app.route('/api/scheduler-status', methods=['GET'])
def scheduler_status():
    """Returns the time until the next automated scrape and the past scrape dates."""
    job = scheduler.get_job('daily_scrape_job')
    next_run = job.next_run_time.isoformat() if job and job.next_run_time else None
    
    db = get_db()
    cursor = db.cursor(dictionary=True)
    
    cursor.execute("SELECT MAX(COALESCE(scraped_at, date_checked)) as last_run FROM daily_stats")
    res = cursor.fetchone()
    last_run = res['last_run'].isoformat() if res and res.get('last_run') else None
    
    # Group by date, using scraped_at where available, falling back to date_checked
    cursor.execute("""
        SELECT
            DATE(COALESCE(scraped_at, date_checked)) as run_date,
            MIN(COALESCE(scraped_at, date_checked)) as started_at,
            MAX(COALESCE(scraped_at, date_checked)) as completed_at,
            COUNT(DISTINCT account_id) as accounts_scraped
        FROM daily_stats
        GROUP BY DATE(COALESCE(scraped_at, date_checked))
        ORDER BY run_date DESC
        LIMIT 60
    """)
    scrape_runs = [
        {
            "run_date": r['run_date'].isoformat(),
            "started_at": r['started_at'].isoformat(),
            "completed_at": r['completed_at'].isoformat(),
            "accounts_scraped": r['accounts_scraped']
        }
        for r in cursor.fetchall() if r.get('run_date')
    ]
    
    return jsonify({
        "success": True,
        "next_run_time": next_run,
        "last_run_date": last_run,
        "scrape_runs": scrape_runs,
        "past_dates": [r["run_date"] for r in scrape_runs]
    })

@app.route('/api/deep-scrape', methods=['POST'])
def deep_scrape():
    """Background-threads a massive paginated history scrape."""
    data = request.json
    username = data.get('username')
    limit = int(data.get('limit', 12))
    delay = int(data.get('delay', 5))
    
    if not username: return jsonify({"success": False}), 400
    
    threading.Thread(target=scraper_backend.run_deep_scrape, args=(username, limit, delay)).start()
    return jsonify({"success": True, "message": f"Deep scrape for @{username} started in the background."})

@app.route('/api/rescrape-post', methods=['POST'])
def rescrape_post():
    """Syncs a single post via background thread"""
    data = request.json
    shortcode = data.get('shortcode')
    if not shortcode: return jsonify({"success": False}), 400
    
    # We thread it to respond fast, or actually just do it inline if they want immediate feedback?
    # Because it's a single post, it's fairly quick, but threading is safer.
    # To return instant UI feedback we'll execute it inline since it's 1 RapidAPI call.
    success = scraper_backend.rescrape_single_post(shortcode)
    
    if success:
        return jsonify({"success": True, "message": f"Successfully rescraped {shortcode}"})
    else:
        return jsonify({"success": False, "error": "Failed to fetch post or invalid response"}), 500

@app.route('/api/llm-models', methods=['GET'])
def get_llm_models():
    try:
        with open("llm_models.json", "r") as f:
            models = json.load(f)
        return jsonify(models)
    except FileNotFoundError:
        return jsonify([])

@app.route('/api/ai-insights', methods=['GET'])
def ai_insights():
    try:
        db = get_db()
        cursor = db.cursor(dictionary=True)
        cursor.execute("SELECT data FROM ai_cache WHERE id = 1")
        res = cursor.fetchone()
        
        if res and res['data']:
            if isinstance(res['data'], str):
                return jsonify(json.loads(res['data']))
            return jsonify(res['data'])
            
        return jsonify({"error": "No insights generated yet. Please dispatch generation via manager."}), 404
    except Exception as e:
        print("AI Fetch Error:", e)
        return jsonify({"error": "Could not read ai cache"}), 500

@app.route('/api/generate-insights', methods=['POST'])
def generate_insights_endpoint():
    try:
        threading.Thread(target=generate_insights_logic).start()
        return jsonify({"success": True, "message": "Insight generation started."})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True)
